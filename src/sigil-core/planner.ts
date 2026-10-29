import { GENERAL_PROFILE_ID, type ProfileRegistry } from '../app-profiles/registry';
import { appNamesFor, type InstalledApp } from './apps';
import { ConfirmationPolicy } from './confirmation';
import { expandIntent, type PlanPlatform } from './flows';
import { RuleBasedModel, type LanguageModel, type ModelContext } from './model';
import { noticeText, type AppChoice, type Notice } from './notices';
import type { PlanStep } from './steps';
import { parseToolCall, toolDefinitions, type Intent } from './tools';

export interface VoiceRequest {
  /** Transcript of what the user said. */
  text: string;
  /** BCP 47 locale of the transcript. */
  locale?: string;
  /** Package of the app in the foreground, when known. */
  foregroundPackage?: string | null;
}

export type IntentSource = 'model' | 'rules';

export interface Plan {
  request: string;
  intent: Intent;
  source: IntentSource;
  summary: string;
  steps: PlanStep[];
  /** True when the plan contains a send, post or other commit that the user must confirm. */
  needsConfirmation: boolean;
}

/**
 * What the planner made of a request. message is an English text for logs;
 * notice says the same as data, for the screens to translate.
 */
export type PlanOutcome =
  | { status: 'planned'; plan: Plan; notes: string[] }
  | { status: 'clarify'; question: string; source: IntentSource }
  | {
      status: 'choose';
      message: string;
      notice: Notice;
      /** The apps a name matched. planChoice plans again with the one the user picks. */
      options: AppChoice[];
      intent: Intent;
      source: IntentSource;
      request: VoiceRequest;
    }
  | { status: 'blocked'; message: string; notice: Notice }
  | { status: 'unsupported'; message: string; intent: Intent; notice: Notice }
  | { status: 'not_understood'; message: string; notes: string[]; notice: Notice };

export interface PlannerOptions {
  profiles: ProfileRegistry;
  /** Optional on device model. When missing or not ready, the fallback plans alone. */
  model?: LanguageModel | null;
  /** Deterministic fallback. Defaults to RuleBasedModel. */
  fallback?: LanguageModel;
  policy?: ConfirmationPolicy;
  /** How long to wait for the model before using the fallback; a function is read on every request. */
  modelTimeoutMs?: number | (() => number);
  defaultMessagingApp?: string;
  defaultSearchApp?: string;
  /** Launchable apps of the phone, read on every request so a new install is heard at once. */
  installedApps?: () => readonly InstalledApp[];
  /** Where plans run. Defaults to android. */
  platform?: PlanPlatform;
}

const NO_APPS: readonly InstalledApp[] = [];

/**
 * Runs work with its own abort signal, and aborts that signal when the time
 * runs out or when the outer signal aborts, so a model that is too slow stops
 * generating instead of holding the phone's CPU after the rules answered.
 */
function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number, outer?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const forward = () => controller.abort();
  if (outer?.aborted) {
    controller.abort();
  } else {
    outer?.addEventListener('abort', forward);
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`no answer after ${ms} ms`));
    }, ms);
    const settle = () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', forward);
    };
    work(controller.signal).then(
      (value) => {
        settle();
        resolve(value);
      },
      (error: unknown) => {
        settle();
        reject(error);
      },
    );
  });
}

/**
 * Turns a voice request into a plan: a finite list of steps (open app, find,
 * tap, type, scroll, wait, confirm). The model, or the rules when no model is
 * ready, only chooses one intent from a fixed tool set; the steps come from
 * deterministic flows, and the confirmation policy guards every send and post.
 */
export class ActionPlanner {
  private readonly profiles: ProfileRegistry;
  private readonly model: LanguageModel | null;
  private readonly fallback: LanguageModel;
  readonly policy: ConfirmationPolicy;
  private readonly modelTimeoutMs: number | (() => number);
  private readonly defaultMessagingApp: string;
  private readonly defaultSearchApp: string;
  private readonly installedApps: () => readonly InstalledApp[];
  private readonly platform: PlanPlatform;

  constructor(options: PlannerOptions) {
    this.profiles = options.profiles;
    this.model = options.model ?? null;
    this.fallback = options.fallback ?? new RuleBasedModel();
    this.policy = options.policy ?? new ConfirmationPolicy(options.profiles);
    this.modelTimeoutMs = options.modelTimeoutMs ?? 4000;
    this.defaultMessagingApp = options.defaultMessagingApp ?? 'whatsapp';
    this.defaultSearchApp = options.defaultSearchApp ?? 'chrome';
    this.installedApps = options.installedApps ?? (() => NO_APPS);
    this.platform = options.platform ?? 'android';
  }

  /** App names the rules and the model may refer to: installed apps, profiles, known apps and their nicknames. */
  knownApps(): string[] {
    return appNamesFor({ profiles: this.profiles, installed: this.installedApps() });
  }

  async plan(request: VoiceRequest, signal?: AbortSignal): Promise<PlanOutcome> {
    const text = request.text.trim();
    const notes: string[] = [];
    if (!text) {
      const notice: Notice = { code: 'nothing_heard' };
      return { status: 'not_understood', message: noticeText(notice), notes, notice };
    }
    const refusal = this.policy.screenRequest(text);
    if (refusal) {
      return { status: 'blocked', message: refusal, notice: { code: 'bulk' } };
    }

    const context = this.modelContext(request);
    const proposal = await this.propose(text, context, notes, signal);
    if (!proposal) {
      const notice: Notice = { code: 'not_understood' };
      return { status: 'not_understood', message: noticeText(notice), notes, notice };
    }
    const { intent, source } = proposal;
    return this.planIntent(intent, { ...request, text }, source, notes);
  }

  /**
   * Plans an intent that is already chosen, by the model, the rules or
   * planChoice. The flows and the confirmation policy apply as in plan.
   */
  planIntent(intent: Intent, request: VoiceRequest, source: IntentSource = 'rules', notes: string[] = []): PlanOutcome {
    if (intent.tool === 'clarify') {
      return { status: 'clarify', question: intent.args.question, source };
    }
    const flow = expandIntent(intent, {
      profiles: this.profiles,
      foregroundPackage: request.foregroundPackage,
      defaultMessagingApp: this.defaultMessagingApp,
      defaultSearchApp: this.defaultSearchApp,
      installedApps: this.installedApps(),
      platform: this.platform,
    });
    if (!flow.ok) {
      if (flow.notice.code === 'which_app') {
        const { options } = flow.notice;
        return { status: 'choose', message: flow.message, notice: flow.notice, options, intent, source, request };
      }
      return flow.reason === 'blocked'
        ? { status: 'blocked', message: flow.message, notice: flow.notice }
        : { status: 'unsupported', message: flow.message, intent, notice: flow.notice };
    }
    const guarded = this.policy.apply(flow.steps);
    if (!guarded.ok) {
      return { status: 'blocked', message: guarded.reason, notice: guarded.notice };
    }
    return {
      status: 'planned',
      plan: {
        request: request.text.trim(),
        intent,
        source,
        summary: flow.summary,
        steps: guarded.steps,
        needsConfirmation: guarded.commits > 0,
      },
      notes,
    };
  }

  /** Plans a choose outcome again with the app the user picked from its options. */
  planChoice(outcome: Extract<PlanOutcome, { status: 'choose' }>, choice: AppChoice): PlanOutcome {
    const { intent } = outcome;
    const picked = 'app' in intent.args ? ({ ...intent, args: { ...intent.args, app: choice.app } } as Intent) : intent;
    return this.planIntent(picked, outcome.request, outcome.source);
  }

  /**
   * Lets an on device model start loading before the request arrives, for
   * example when the user starts to speak. Does nothing without a model.
   */
  prepareModel(request: Omit<VoiceRequest, 'text'> = {}): void {
    if (this.model && !this.model.isReady()) {
      this.model.prepare?.(this.modelContext(request), toolDefinitions());
    }
  }

  private modelContext(request: Omit<VoiceRequest, 'text'>): ModelContext {
    const foreground = request.foregroundPackage ? this.profiles.forPackage(request.foregroundPackage) : null;
    return {
      locale: request.locale ?? 'en-US',
      foregroundApp: foreground && foreground.id !== GENERAL_PROFILE_ID ? foreground.name : null,
      knownApps: this.knownApps(),
    };
  }

  private timeoutMs(): number {
    return typeof this.modelTimeoutMs === 'function' ? this.modelTimeoutMs() : this.modelTimeoutMs;
  }

  private async propose(
    text: string,
    context: ModelContext,
    notes: string[],
    signal?: AbortSignal,
  ): Promise<{ intent: Intent; source: IntentSource } | null> {
    const tools = toolDefinitions();
    const model = this.model;
    if (model && !model.isReady()) {
      // An installed model that is not loaded starts loading now; this request
      // goes to the rules instead of waiting for the weights.
      model.prepare?.(context, tools);
      notes.push('The model is not loaded yet. The rules planned this request.');
    } else if (model) {
      try {
        const reply = await withTimeout((inner) => model.propose(text, context, tools, inner), this.timeoutMs(), signal);
        if (reply.toolCalls.length > 1) {
          notes.push(`The model proposed ${reply.toolCalls.length} actions. Sigil runs one per request.`);
        }
        const first = reply.toolCalls[0];
        if (first) {
          const parsed = parseToolCall(first);
          if (parsed.ok) {
            return { intent: parsed.intent, source: 'model' };
          }
          notes.push(`Model answer rejected: ${parsed.error}`);
        } else {
          notes.push('The model proposed no action.');
        }
      } catch (error) {
        notes.push(`Model unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    const reply = await this.fallback.propose(text, context, tools, signal);
    const first = reply.toolCalls[0];
    if (!first) {
      return null;
    }
    const parsed = parseToolCall(first);
    return parsed.ok ? { intent: parsed.intent, source: 'rules' } : null;
  }
}
