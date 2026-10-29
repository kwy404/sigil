import type { ProfileRegistry } from '../app-profiles/registry';
import type { AppProfile } from '../app-profiles/schema';
import { isSensitiveLabel, namesSeveralPeople } from './confirmation';
import type { PlanStep, StepTarget } from './steps';
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
  | { ok: false; reason: 'unknown_app' | 'unsupported' | 'blocked'; message: string };

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

function unknownApp(name: string): FlowResult {
  return { ok: false, reason: 'unknown_app', message: `Sigil does not know an app called "${name}" yet.` };
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
        return {
          ok: false,
          reason: 'blocked',
          message: 'Sigil sends a message to one person at a time. Ask again for each person.',
        };
      }
      if (!has(app, 'messageInput') || !has(app, 'send')) {
        return { ok: false, reason: 'unsupported', message: `Sigil cannot send messages in ${app.name} yet.` };
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
        return { ok: false, reason: 'unsupported', message: `Sigil cannot find contacts in ${app.name} yet.` };
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
        return { ok: false, reason: 'unsupported', message: `Sigil cannot search in ${app.name} yet.` };
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

    case 'media':
      return {
        ok: true,
        steps: [{ kind: 'media', action: intent.args.action }],
        summary: intent.args.action === 'play_pause' ? 'Play or pause' : `${intent.args.action === 'next' ? 'Next' : 'Previous'} track`,
      };

    case 'create_post': {
      const { caption } = intent.args;
      const app = profiles.findApp(intent.args.app);
      if (!app) {
        return unknownApp(intent.args.app);
      }
      if (!has(app, 'create') || !has(app, 'captionInput') || !has(app, 'share')) {
        return { ok: false, reason: 'unsupported', message: `Sigil cannot post on ${app.name} yet.` };
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
      return { ok: false, reason: 'unsupported', message: intent.args.question };
  }
}
