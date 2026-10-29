import { GENERAL_PROFILE_ID, type ProfileRegistry } from '../app-profiles/registry';
import type { AppProfile } from '../app-profiles/schema';
import { isSensitiveLabel, namesSeveralPeople } from './confirmation';
import { noticeText, type Notice } from './notices';
import { describeStep, type PlanStep, type StepTarget } from './steps';
import type { Intent } from './tools';

export interface FlowContext {
  profiles: ProfileRegistry;
  /** Package of the app in the foreground when the request was made. */
  foregroundPackage?: string | null;
  /** Profile id used when a message request names no app. */
  defaultMessagingApp: string;
  /** Profile id used when a search request names no app. */
  defaultSearchApp: string;
}

export type FlowResult =
  | { ok: true; steps: PlanStep[]; summary: string }
  | { ok: false; reason: 'unknown_app' | 'unsupported' | 'blocked'; message: string; notice: Notice };

const APP_TIMEOUT_MS = 8000;
const NODE_TIMEOUT_MS = 6000;
/** Time the user has to pick the photo or video before Sigil gives up waiting for the caption field. */
const MEDIA_PICK_TIMEOUT_MS = 180000;

function selectorTarget(app: AppProfile, name: string): StepTarget {
  return { by: 'selector', app: app.id, name };
}

function openSteps(app: AppProfile, url?: string): PlanStep[] {
  return [
    { kind: 'open_app', app: app.id, label: app.name, packageName: app.packages[0], url: url ?? app.links?.launch },
    { kind: 'wait', until: { app: app.id }, timeoutMs: APP_TIMEOUT_MS },
  ];
}

function refuse(reason: 'unknown_app' | 'unsupported' | 'blocked', notice: Notice): FlowResult {
  return { ok: false, reason, message: noticeText(notice), notice };
}

function unknownApp(name: string): FlowResult {
  return refuse('unknown_app', { code: 'unknown_app', app: name });
}

/** Turns an intent into concrete steps. Pure and deterministic: the same intent always gives the same plan. */
export function expandIntent(intent: Intent, ctx: FlowContext): FlowResult {
  const { profiles } = ctx;
  const has = (app: AppProfile, name: string) => profiles.selector(app.id, name) !== undefined;

  switch (intent.tool) {
    case 'open_app': {
      const app = profiles.findApp(intent.args.app);
      if (!app) {
        // Apps without a profile can still be opened by their launcher label.
        return {
          ok: true,
          steps: [{ kind: 'open_app', app: intent.args.app, label: intent.args.app }],
          summary: `Open ${intent.args.app}`,
        };
      }
      return { ok: true, steps: openSteps(app), summary: `Open ${app.name}` };
    }

    case 'send_message': {
      const { contact, text } = intent.args;
      const app = intent.args.app ? profiles.findApp(intent.args.app) : profiles.get(ctx.defaultMessagingApp);
      if (!app) {
        return unknownApp(intent.args.app ?? ctx.defaultMessagingApp);
      }
      if (namesSeveralPeople(contact)) {
        return refuse('blocked', { code: 'several_people' });
      }
      if (!has(app, 'messageInput') || !has(app, 'send')) {
        return refuse('unsupported', { code: 'cannot_send', app: app.name, appId: app.id });
      }
      const steps: PlanStep[] = [...openSteps(app)];
      if (has(app, 'startChat')) {
        steps.push(
          { kind: 'tap', target: selectorTarget(app, 'startChat'), commit: false },
          {
            kind: 'type',
            text: contact,
            target: has(app, 'recipientInput') ? selectorTarget(app, 'recipientInput') : { by: 'focused' },
            submit: false,
          },
        );
      } else if (has(app, 'search')) {
        steps.push(
          { kind: 'tap', target: selectorTarget(app, 'search'), commit: false },
          {
            kind: 'type',
            text: contact,
            target: has(app, 'searchInput') ? selectorTarget(app, 'searchInput') : { by: 'focused' },
            submit: false,
          },
        );
      } else {
        return refuse('unsupported', { code: 'cannot_find_contacts', app: app.name, appId: app.id });
      }
      steps.push(
        { kind: 'find', target: { by: 'text', value: contact }, scroll: false, timeoutMs: NODE_TIMEOUT_MS },
        { kind: 'tap', target: { by: 'text', value: contact }, commit: false },
        { kind: 'find', target: selectorTarget(app, 'messageInput'), scroll: false, timeoutMs: NODE_TIMEOUT_MS },
        { kind: 'type', text, target: selectorTarget(app, 'messageInput'), submit: false },
        { kind: 'confirm', summary: `Send "${text}" to ${contact} on ${app.name}?`, reason: 'send' },
        { kind: 'tap', target: selectorTarget(app, 'send'), commit: true },
      );
      return { ok: true, steps, summary: `Send "${text}" to ${contact} on ${app.name}` };
    }

    case 'search': {
      const { query } = intent.args;
      const app = intent.args.app ? profiles.findApp(intent.args.app) : profiles.get(ctx.defaultSearchApp);
      if (!app) {
        return unknownApp(intent.args.app ?? ctx.defaultSearchApp);
      }
      const template = app.links?.search;
      if (template) {
        const url = template.split('{query}').join(encodeURIComponent(query));
        return { ok: true, steps: openSteps(app, url), summary: `Search ${app.name} for ${query}` };
      }
      if (!has(app, 'search')) {
        return refuse('unsupported', { code: 'cannot_search', app: app.name, appId: app.id });
      }
      return {
        ok: true,
        steps: [
          ...openSteps(app),
          { kind: 'tap', target: selectorTarget(app, 'search'), commit: false },
          {
            kind: 'type',
            text: query,
            target: has(app, 'searchInput') ? selectorTarget(app, 'searchInput') : { by: 'focused' },
            submit: true,
          },
        ],
        summary: `Search ${app.name} for ${query}`,
      };
    }

    case 'scroll':
      return { ok: true, steps: [{ kind: 'scroll', direction: intent.args.direction }], summary: `Scroll ${intent.args.direction}` };

    case 'navigate':
      return {
        ok: true,
        steps: [{ kind: 'navigate', action: intent.args.action }],
        summary: `Go ${intent.args.action.replace('_', ' ')}`,
      };

    case 'tap': {
      const { label } = intent.args;
      const inSettings = profiles.forPackage(ctx.foregroundPackage).id === 'settings';
      return {
        ok: true,
        steps: [
          { kind: 'find', target: { by: 'text', value: label }, scroll: true, timeoutMs: 3000 },
          { kind: 'tap', target: { by: 'text', value: label }, commit: inSettings || isSensitiveLabel(label) },
        ],
        summary: `Tap "${label}"`,
      };
    }

    case 'type_text':
      return {
        ok: true,
        steps: [{ kind: 'type', text: intent.args.text, target: { by: 'focused' }, submit: false }],
        summary: `Type "${intent.args.text}"`,
      };

    case 'media': {
      const step: PlanStep = { kind: 'media', action: intent.args.action };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'seek': {
      const seconds = intent.args.direction === 'back' ? -intent.args.seconds : intent.args.seconds;
      const step: PlanStep = { kind: 'seek', seconds };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'playback_speed': {
      const step: PlanStep = { kind: 'speed', rate: intent.args.rate };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'volume': {
      const { action, level, stream } = intent.args;
      const step: PlanStep = { kind: 'volume', stream: stream ?? 'media', action, ...(level !== undefined ? { level } : {}) };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'brightness': {
      const { action, level } = intent.args;
      const step: PlanStep = { kind: 'brightness', action, ...(level !== undefined ? { level } : {}) };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'settings_panel': {
      const step: PlanStep = { kind: 'panel', panel: intent.args.panel };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'control_sphere': {
      const step: PlanStep = { kind: 'sphere', action: intent.args.action };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'like': {
      // A like acts on what is on screen, so it never opens an app on its own.
      const named = intent.args.app ? profiles.findApp(intent.args.app) : undefined;
      if (intent.args.app && !named) {
        return unknownApp(intent.args.app);
      }
      const app = named ?? profiles.forPackage(ctx.foregroundPackage);
      if (app.id === GENERAL_PROFILE_ID) {
        return refuse('unsupported', { code: 'like_needs_app' });
      }
      if (!has(app, 'like')) {
        return refuse('unsupported', { code: 'cannot_like', app: app.name, appId: app.id });
      }
      return {
        ok: true,
        steps: [
          { kind: 'find', target: selectorTarget(app, 'like'), scroll: false, timeoutMs: 3000 },
          { kind: 'tap', target: selectorTarget(app, 'like'), commit: false },
        ],
        summary: `Like this on ${app.name}`,
      };
    }

    case 'create_post': {
      const { caption } = intent.args;
      const app = profiles.findApp(intent.args.app);
      if (!app) {
        return unknownApp(intent.args.app);
      }
      if (!has(app, 'create') || !has(app, 'captionInput') || !has(app, 'share')) {
        return refuse('unsupported', { code: 'cannot_post', app: app.name, appId: app.id });
      }
      return {
        ok: true,
        steps: [
          ...openSteps(app),
          { kind: 'tap', target: selectorTarget(app, 'create'), commit: false },
          // The user picks the photo or video and moves to the caption screen.
          { kind: 'wait', until: { target: selectorTarget(app, 'captionInput') }, timeoutMs: MEDIA_PICK_TIMEOUT_MS },
          { kind: 'tap', target: selectorTarget(app, 'captionInput'), commit: false },
          { kind: 'type', text: caption, target: selectorTarget(app, 'captionInput'), submit: false },
          { kind: 'confirm', summary: `Share this post on ${app.name} with the caption "${caption}"?`, reason: 'post' },
          { kind: 'tap', target: selectorTarget(app, 'share'), commit: true },
        ],
        summary: `Post on ${app.name} with the caption "${caption}"`,
      };
    }

    case 'clarify':
      return refuse('unsupported', { code: 'question', question: intent.args.question });
  }
}
