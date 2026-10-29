import type { ProfileRegistry } from '../app-profiles/registry';
import type { GlobalAction, MediaAction } from '../app-profiles/schema';
import { foldText } from '../app-profiles/text';
import type { Direction } from '../gesture-engine/gestures';
import { ConfirmationPolicy } from './confirmation';
import type { Plan } from './planner';
import { describeStep, type ConfirmReason, type PlanStep, type StepTarget } from './steps';

export interface NodeBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A control of the active window, as the accessibility tree reports it. */
export interface UiNode {
  id: string;
  text?: string;
  description?: string;
  resourceId?: string;
  className?: string;
  bounds: NodeBounds;
  clickable: boolean;
  editable: boolean;
  focused: boolean;
}

/**
 * Describes the control a step looks for. A node matches when it matches at
 * least one of resourceIds, texts or descriptions, and className and focused
 * when they are set. Texts and descriptions ignore case and accents and also
 * match a longer label that starts with the candidate followed by a space.
 */
export interface NodeQuery {
  resourceIds?: string[];
  texts?: string[];
  descriptions?: string[];
  className?: string;
  focused?: boolean;
}

function labelMatches(value: string | undefined, candidates: readonly string[] | undefined): boolean {
  if (!value || !candidates) {
    return false;
  }
  const folded = foldText(value).trim();
  return candidates.some((candidate) => {
    const c = foldText(candidate).trim();
    return folded === c || folded.startsWith(`${c} `);
  });
}

export function nodeMatches(node: UiNode, query: NodeQuery): boolean {
  if (query.focused && !node.focused) {
    return false;
  }
  if (query.className && node.className !== query.className) {
    return false;
  }
  const hasIdentity = Boolean(query.resourceIds?.length || query.texts?.length || query.descriptions?.length);
  if (!hasIdentity) {
    return Boolean(query.focused);
  }
  return (
    (node.resourceId !== undefined && (query.resourceIds ?? []).includes(node.resourceId)) ||
    labelMatches(node.text, query.texts) ||
    labelMatches(node.description, query.descriptions)
  );
}

export interface AppLaunch {
  app: string;
  label: string;
  packageName?: string;
  url?: string;
}

/**
 * What the executor needs from the device. src/system-control implements it
 * with the Android accessibility service; tests use an in memory fake.
 */
export interface DeviceController {
  /** True when actions reach other apps, false inside Sigil only. */
  readonly systemWide: boolean;
  openApp(launch: AppLaunch): Promise<boolean>;
  foregroundPackage(): Promise<string | null>;
  findNode(query: NodeQuery): Promise<UiNode | null>;
  tapNode(node: UiNode): Promise<boolean>;
  /** Replaces the text of an editable node. submit presses the keyboard action key. */
  typeText(text: string, node: UiNode, submit: boolean): Promise<boolean>;
  scroll(direction: Direction): Promise<boolean>;
  navigate(action: GlobalAction): Promise<boolean>;
  media(action: MediaAction): Promise<boolean>;
}

export interface ConfirmationRequest {
  summary: string;
  reason: ConfirmReason;
  plan: Plan;
}

/** Shows the summary to the user and resolves true only on an explicit yes. */
export type ConfirmHandler = (request: ConfirmationRequest) => Promise<boolean>;

export type StepStatus = 'running' | 'done' | 'failed' | 'cancelled';

export interface StepEvent {
  index: number;
  step: PlanStep;
  label: string;
  status: StepStatus;
  detail?: string;
}

export interface ExecutionResult {
  status: 'completed' | 'failed' | 'cancelled' | 'refused';
  completedSteps: number;
  message?: string;
}

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface ExecutorOptions {
  device: DeviceController;
  profiles: ProfileRegistry;
  confirm: ConfirmHandler;
  policy?: ConfirmationPolicy;
  clock?: Clock;
  /** Delay between two looks at the screen while waiting, in milliseconds. */
  pollMs?: number;
  /** An answer to a confirmation counts only if it comes within this time, in milliseconds. */
  confirmationTtlMs?: number;
  /** Most scrolls a find step may do. */
  maxScrolls?: number;
  onStep?: (event: StepEvent) => void;
}

type StepOutcome = { ok: true } | { ok: false; detail: string; status: 'failed' | 'cancelled' | 'refused' };

/**
 * Runs a plan one visible step at a time. A commit step (send, post) runs only
 * right after a confirm step the user accepted, within the confirmation time
 * limit, and the whole plan stops at the first failure or refusal.
 */
export class PlanExecutor {
  private readonly device: DeviceController;
  private readonly profiles: ProfileRegistry;
  private readonly confirmHandler: ConfirmHandler;
  private readonly policy: ConfirmationPolicy;
  private readonly clock: Clock;
  private readonly pollMs: number;
  private readonly confirmationTtlMs: number;
  private readonly maxScrolls: number;
  private readonly onStep?: (event: StepEvent) => void;

  constructor(options: ExecutorOptions) {
    this.device = options.device;
    this.profiles = options.profiles;
    this.confirmHandler = options.confirm;
    this.policy = options.policy ?? new ConfirmationPolicy(options.profiles);
    this.clock = options.clock ?? systemClock;
    this.pollMs = options.pollMs ?? 250;
    this.confirmationTtlMs = options.confirmationTtlMs ?? 30000;
    this.maxScrolls = options.maxScrolls ?? 5;
    this.onStep = options.onStep;
  }

  async run(plan: Plan, signal?: AbortSignal): Promise<ExecutionResult> {
    const problem = this.policy.check(plan.steps);
    if (problem) {
      return { status: 'refused', completedSteps: 0, message: problem };
    }
    let confirmed = false;
    for (let index = 0; index < plan.steps.length; index++) {
      const step = plan.steps[index];
      const label = describeStep(step);
      if (signal?.aborted) {
        this.onStep?.({ index, step, label, status: 'cancelled' });
        return { status: 'cancelled', completedSteps: index, message: 'Stopped by the user.' };
      }
      this.onStep?.({ index, step, label, status: 'running' });

      if (step.kind === 'tap' && this.policy.isCommit(step) && !confirmed) {
        const detail = 'This step sends or posts and was not confirmed. Nothing was sent.';
        this.onStep?.({ index, step, label, status: 'failed', detail });
        return { status: 'refused', completedSteps: index, message: detail };
      }
      const outcome = await this.safely(step, plan);

      // A confirmation covers only the step right after it.
      confirmed = step.kind === 'confirm' && outcome.ok;

      if (!outcome.ok) {
        this.onStep?.({ index, step, label, status: outcome.status === 'cancelled' ? 'cancelled' : 'failed', detail: outcome.detail });
        return { status: outcome.status, completedSteps: index, message: outcome.detail };
      }
      this.onStep?.({ index, step, label, status: 'done' });
    }
    return { status: 'completed', completedSteps: plan.steps.length };
  }

  private async safely(step: PlanStep, plan: Plan): Promise<StepOutcome> {
    try {
      return await this.runStep(step, plan);
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error), status: 'failed' };
    }
  }

  /** Translates a target into a node query using the app profiles. */
  queryFor(target: StepTarget): NodeQuery | null {
    switch (target.by) {
      case 'selector': {
        const selector = this.profiles.selector(target.app, target.name);
        if (!selector) {
          return null;
        }
        return {
          resourceIds: selector.resourceId,
          texts: selector.text,
          descriptions: selector.contentDescription,
          className: selector.className,
        };
      }
      case 'text':
        return { texts: [target.value] };
      case 'description':
        return { descriptions: [target.value] };
      case 'focused':
        return { focused: true };
    }
  }

  private async waitForNode(query: NodeQuery, timeoutMs: number, scroll: boolean): Promise<UiNode | null> {
    const start = this.clock.now();
    let scrolls = 0;
    for (;;) {
      const node = await this.device.findNode(query);
      if (node) {
        return node;
      }
      if (this.clock.now() - start >= timeoutMs) {
        return null;
      }
      if (scroll && scrolls < this.maxScrolls) {
        scrolls++;
        await this.device.scroll('down');
      }
      await this.clock.sleep(this.pollMs);
    }
  }

  private async waitForApp(appId: string, timeoutMs: number): Promise<boolean> {
    const packages = this.profiles.get(appId)?.packages ?? [appId];
    const start = this.clock.now();
    for (;;) {
      const current = await this.device.foregroundPackage();
      if (current !== null && packages.includes(current)) {
        return true;
      }
      if (this.clock.now() - start >= timeoutMs) {
        return false;
      }
      await this.clock.sleep(this.pollMs);
    }
  }

  private async runStep(step: PlanStep, plan: Plan): Promise<StepOutcome> {
    const fail = (detail: string): StepOutcome => ({ ok: false, detail, status: 'failed' });
    switch (step.kind) {
      case 'open_app': {
        const opened = await this.device.openApp({
          app: step.app,
          label: step.label,
          packageName: step.packageName,
          url: step.url,
        });
        return opened ? { ok: true } : fail(`Could not open ${step.label}.`);
      }
      case 'wait': {
        if ('app' in step.until) {
          return (await this.waitForApp(step.until.app, step.timeoutMs)) ? { ok: true } : fail(`${step.until.app} did not open.`);
        }
        const query = this.queryFor(step.until.target);
        if (!query) return fail('Unknown control.');
        return (await this.waitForNode(query, step.timeoutMs, false)) ? { ok: true } : fail('The screen did not show what Sigil waited for.');
      }
      case 'find': {
        const query = this.queryFor(step.target);
        if (!query) return fail('Unknown control.');
        return (await this.waitForNode(query, step.timeoutMs, step.scroll)) ? { ok: true } : fail(`${describeStep(step)} failed.`);
      }
      case 'tap': {
        const query = this.queryFor(step.target);
        const node = query ? await this.waitForNode(query, 1500, false) : null;
        if (!node) return fail(`Nothing to tap: ${describeStep(step)}.`);
        return (await this.device.tapNode(node)) ? { ok: true } : fail('The tap was not delivered.');
      }
      case 'type': {
        const query = this.queryFor(step.target);
        const node = query ? await this.waitForNode(query, 2000, false) : null;
        if (!node) return fail('No text field to type into.');
        if (!node.focused && !(await this.device.tapNode(node))) {
          return fail('Could not focus the text field.');
        }
        return (await this.device.typeText(step.text, node, step.submit)) ? { ok: true } : fail('Typing failed.');
      }
      case 'scroll':
        return (await this.device.scroll(step.direction)) ? { ok: true } : fail('Nothing to scroll.');
      case 'navigate':
        return (await this.device.navigate(step.action)) ? { ok: true } : fail(`Could not go ${step.action}.`);
      case 'media':
        return (await this.device.media(step.action)) ? { ok: true } : fail('No media session answered.');
      case 'confirm': {
        const askedAt = this.clock.now();
        const accepted = await this.confirmHandler({ summary: step.summary, reason: step.reason, plan });
        if (!accepted) {
          return { ok: false, detail: 'Not confirmed. Nothing was sent.', status: 'cancelled' };
        }
        if (this.clock.now() - askedAt > this.confirmationTtlMs) {
          // The screen may have changed while the question was open, so a late yes does not count.
          return { ok: false, detail: 'The confirmation came too late. Nothing was sent. Ask again.', status: 'refused' };
        }
        return { ok: true };
      }
    }
  }
}
