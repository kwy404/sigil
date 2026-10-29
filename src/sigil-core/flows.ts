import { GENERAL_PROFILE_ID, type ProfileRegistry } from '../app-profiles/registry';
import type { AppPlace, AppProfile } from '../app-profiles/schema';
import { findProfile, resolveApp, SYSTEM_APP_WORDS, targetInfo, type AppTarget, type InstalledApp } from './apps';
import { isSensitiveLabel, namesSeveralPeople } from './confirmation';
import { noticeText, type AndroidOnlyFeature, type Notice } from './notices';
import { describeStep, formatDuration, type PlanStep, type StepTarget } from './steps';
import type { Intent } from './tools';

/** Where the plan runs: Android can act on other apps, iOS only opens them through links. */
export type PlanPlatform = 'android' | 'ios' | 'web';

export interface FlowContext {
  profiles: ProfileRegistry;
  /** Package of the app in the foreground when the request was made. */
  foregroundPackage?: string | null;
  /** Profile id used when a message request names no app. */
  defaultMessagingApp: string;
  /** Profile id used when a search request names no app. */
  defaultSearchApp: string;
  /** Launchable apps of the phone, empty when they cannot be listed. */
  installedApps?: readonly InstalledApp[];
  platform?: PlanPlatform;
}

export type FlowResult =
  | { ok: true; steps: PlanStep[]; summary: string }
  | { ok: false; reason: 'unknown_app' | 'unsupported' | 'blocked' | 'choose'; message: string; notice: Notice };

const APP_TIMEOUT_MS = 8000;
const NODE_TIMEOUT_MS = 6000;
/** Time the user has to pick the photo or video before Sigil gives up waiting for the caption field. */
const MEDIA_PICK_TIMEOUT_MS = 180000;
/** Profile of the home screen and recent apps. */
export const LAUNCHER_PROFILE_ID = 'launcher';

/** The app a place opens in when the request names none. */
const PLACE_APPS: Record<AppPlace, string> = {
  reels: 'instagram',
  shorts: 'youtube',
  subscriptions: 'youtube',
  messages: 'instagram',
  profile: 'instagram',
  explore: 'instagram',
};

function selectorTarget(app: AppProfile, name: string): StepTarget {
  return { by: 'selector', app: app.id, name };
}

function refuse(reason: 'unknown_app' | 'unsupported' | 'blocked' | 'choose', notice: Notice): FlowResult {
  return { ok: false, reason, message: noticeText(notice), notice };
}

function unknownApp(name: string): FlowResult {
  return refuse('unknown_app', { code: 'unknown_app', app: name });
}

function androidOnly(feature: AndroidOnlyFeature): FlowResult {
  return refuse('unsupported', { code: 'android_only', feature });
}

/** "g1 ponto com ponto br" or "Wikipedia.org" as https://g1.com.br, or null when it has no domain. */
export function normalizeWebsite(spoken: string): string | null {
  let text = spoken
    .trim()
    .replace(/\s+(?:dot|ponto|punto|point|punkt)\s+/giu, '.')
    .replace(/\s*(?:点|ドット)\s*/gu, '.')
    .replace(/\s+/g, '')
    .replace(/^["']|["']$/g, '');
  if (!/^[a-z][a-z0-9+.-]*:\/\//iu.test(text)) {
    text = `https://${text}`;
  }
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]+)(.*)$/iu.exec(text);
  if (!match || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/iu.test(match[2])) {
    return null;
  }
  return `${match[1].toLowerCase()}://${match[2].toLowerCase()}${match[3]}`;
}

/** Turns an intent into concrete steps. Pure and deterministic: the same intent always gives the same plan. */
export function expandIntent(intent: Intent, ctx: FlowContext): FlowResult {
  const { profiles } = ctx;
  const platform = ctx.platform ?? 'android';
  const installed = ctx.installedApps ?? [];
  const has = (app: AppProfile, name: string) => profiles.selector(app.id, name) !== undefined;

  /** Opens an app profile and, where Sigil can see the app in front, waits for it. */
  const openSteps = (app: AppProfile, url?: string): PlanStep[] => {
    const open: PlanStep = {
      kind: 'open_app',
      app: app.id,
      label: app.name,
      packageName: app.packages[0],
      url: url ?? app.links?.launch,
    };
    return platform === 'android' ? [open, { kind: 'wait', until: { app: app.id }, timeoutMs: APP_TIMEOUT_MS }] : [open];
  };

  const launch = (target: AppTarget): PlanStep[] | null => {
    switch (target.kind) {
      case 'installed': {
        const profile = profiles.forPackage(target.packageName);
        return [
          {
            kind: 'open_app',
            app: profile.id === GENERAL_PROFILE_ID ? target.packageName : profile.id,
            label: target.label,
            packageName: target.packageName,
          },
          { kind: 'wait', until: { app: target.packageName }, timeoutMs: APP_TIMEOUT_MS },
        ];
      }
      case 'profile':
        if (platform !== 'android' && !target.profile.links?.launch) return null;
        return openSteps(target.profile);
      case 'known':
        if (platform !== 'android' && !target.app.iosUrl) return null;
        return [
          {
            kind: 'open_app',
            app: target.app.packages[0],
            label: target.app.name,
            packageName: target.app.packages[0],
            ...(target.app.iosUrl ? { iosUrl: target.app.iosUrl } : {}),
          },
        ];
      case 'system': {
        const iosUrl = SYSTEM_APP_WORDS[target.role].iosUrl;
        if (platform !== 'android' && !iosUrl) return null;
        return [{ kind: 'open_app', app: `role:${target.role}`, label: target.spoken, role: target.role, ...(iosUrl ? { iosUrl } : {}) }];
      }
    }
  };

  /** Android knows which apps are on the phone; a known app or profile that is not there is not installed. */
  const missing = (target: AppTarget): string | null => {
    if (platform !== 'android' || installed.length === 0 || (target.kind !== 'known' && target.kind !== 'profile')) {
      return null;
    }
    const { name, packages } = targetInfo(target);
    return installed.some((app) => packages.includes(app.packageName)) ? null : name;
  };

  /** Opens a messaging app at the chat with one contact. */
  const chatSteps = (app: AppProfile, contact: string): PlanStep[] | FlowResult => {
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
    );
    return steps;
  };

  switch (intent.tool) {
    case 'open_app': {
      const resolution = resolveApp(intent.args.app, { profiles, installed });
      if (resolution.kind === 'several') {
        return refuse('choose', {
          code: 'which_app',
          options: resolution.options.map((app) => ({ label: app.label, app: app.packageName })),
        });
      }
      if (resolution.kind === 'none') {
        if (platform !== 'android') return unknownApp(intent.args.app);
        // Apps Sigil could not match can still be opened by their launcher label.
        return {
          ok: true,
          steps: [{ kind: 'open_app', app: intent.args.app, label: intent.args.app }],
          summary: `Open ${intent.args.app}`,
        };
      }
      const absent = missing(resolution.target);
      if (absent) return refuse('unsupported', { code: 'not_installed', app: absent });
      const steps = launch(resolution.target);
      if (!steps) return androidOnly('open');
      return { ok: true, steps, summary: `Open ${(steps[0] as { label: string }).label}` };
    }

    case 'close_app': {
      if (platform !== 'android') return androidOnly('close');
      if (!intent.args.app) {
        const front = ctx.foregroundPackage;
        if (!front) return refuse('unsupported', { code: 'no_app_in_front' });
        const profile = profiles.forPackage(front);
        const label =
          installed.find((app) => app.packageName === front)?.label ?? (profile.id === GENERAL_PROFILE_ID ? front : profile.name);
        const step: PlanStep = { kind: 'close_app', app: front, label, packages: [front] };
        return { ok: true, steps: [step], summary: describeStep(step) };
      }
      const resolution = resolveApp(intent.args.app, { profiles, installed });
      if (resolution.kind === 'several') {
        return refuse('choose', {
          code: 'which_app',
          options: resolution.options.map((app) => ({ label: app.label, app: app.packageName })),
        });
      }
      if (resolution.kind === 'none') return unknownApp(intent.args.app);
      const target = resolution.target;
      const absent = missing(target);
      if (absent) return refuse('unsupported', { code: 'not_installed', app: absent });
      const { name, packages } = targetInfo(target);
      const app =
        target.kind === 'installed'
          ? target.packageName
          : target.kind === 'profile'
            ? target.profile.id
            : target.kind === 'known'
              ? target.app.packages[0]
              : `role:${target.role}`;
      const step: PlanStep = { kind: 'close_app', app, label: name, packages };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'close_all_apps': {
      if (platform !== 'android') return androidOnly('close');
      const launcher = profiles.get(LAUNCHER_PROFILE_ID);
      if (!launcher || !has(launcher, 'clearAll')) return refuse('unsupported', { code: 'android_only', feature: 'close' });
      return {
        ok: true,
        steps: [
          { kind: 'navigate', action: 'recents' },
          { kind: 'wait', until: { target: selectorTarget(launcher, 'clearAll') }, timeoutMs: 3000 },
          { kind: 'confirm', summary: 'Close all apps?', reason: 'close_all' },
          { kind: 'tap', target: selectorTarget(launcher, 'clearAll'), commit: true },
          { kind: 'navigate', action: 'home' },
        ],
        summary: 'Close all apps',
      };
    }

    case 'open_place': {
      const { place } = intent.args;
      // Without an app name, the app in front is used when it has that place.
      const front = profiles.forPackage(ctx.foregroundPackage);
      const app = intent.args.app
        ? findProfile(intent.args.app, profiles)
        : front.places?.[place]
          ? front
          : profiles.get(PLACE_APPS[place]);
      if (!app) return unknownApp(intent.args.app ?? PLACE_APPS[place]);
      const target = app.places?.[place];
      if (!target || (!target.link && platform !== 'android')) {
        return refuse('unsupported', { code: 'cannot_open_place', app: app.name, appId: app.id, place });
      }
      const summary = `Open ${place} in ${app.name}`;
      if (target.link) {
        return { ok: true, steps: openSteps(app, target.link), summary };
      }
      const tab = target.tab ?? '';
      return {
        ok: true,
        steps: [
          ...openSteps(app),
          { kind: 'find', target: selectorTarget(app, tab), scroll: false, timeoutMs: NODE_TIMEOUT_MS },
          { kind: 'tap', target: selectorTarget(app, tab), commit: false },
        ],
        summary,
      };
    }

    case 'open_chat': {
      const { contact } = intent.args;
      const app = intent.args.app ? findProfile(intent.args.app, profiles) : profiles.get(ctx.defaultMessagingApp);
      if (!app) return unknownApp(intent.args.app ?? ctx.defaultMessagingApp);
      if (namesSeveralPeople(contact)) return refuse('blocked', { code: 'several_people' });
      if (platform !== 'android') return androidOnly('chat');
      const steps = chatSteps(app, contact);
      return Array.isArray(steps) ? { ok: true, steps, summary: `Open the chat with ${contact} on ${app.name}` } : steps;
    }

    case 'send_message': {
      const { contact, text } = intent.args;
      const app = intent.args.app ? findProfile(intent.args.app, profiles) : profiles.get(ctx.defaultMessagingApp);
      if (!app) {
        return unknownApp(intent.args.app ?? ctx.defaultMessagingApp);
      }
      if (namesSeveralPeople(contact)) {
        return refuse('blocked', { code: 'several_people' });
      }
      if (!has(app, 'messageInput') || !has(app, 'send')) {
        return refuse('unsupported', { code: 'cannot_send', app: app.name, appId: app.id });
      }
      const chat = chatSteps(app, contact);
      if (!Array.isArray(chat)) {
        return chat;
      }
      return {
        ok: true,
        steps: [
          ...chat,
          { kind: 'find', target: selectorTarget(app, 'messageInput'), scroll: false, timeoutMs: NODE_TIMEOUT_MS },
          { kind: 'type', text, target: selectorTarget(app, 'messageInput'), submit: false },
          { kind: 'confirm', summary: `Send "${text}" to ${contact} on ${app.name}?`, reason: 'send' },
          { kind: 'tap', target: selectorTarget(app, 'send'), commit: true },
        ],
        summary: `Send "${text}" to ${contact} on ${app.name}`,
      };
    }

    case 'search': {
      const { query } = intent.args;
      const app = intent.args.app ? findProfile(intent.args.app, profiles) : profiles.get(ctx.defaultSearchApp);
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

    case 'open_website': {
      const url = normalizeWebsite(intent.args.url);
      if (!url) {
        // A name without a domain becomes a web search.
        return expandIntent({ tool: 'search', args: { query: intent.args.url } }, ctx);
      }
      const host = url.replace(/^[a-z][a-z0-9+.-]*:\/\//iu, '').split(/[/?#]/)[0];
      return { ok: true, steps: [{ kind: 'open_app', app: 'web', label: host, url }], summary: `Open ${host}` };
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

    case 'open_tutorial':
      return { ok: true, steps: [{ kind: 'tutorial' }], summary: 'Open the tutorial' };

    case 'set_timer': {
      if (platform !== 'android') return androidOnly('timer');
      const step: PlanStep = { kind: 'timer', seconds: intent.args.seconds };
      return { ok: true, steps: [step], summary: `Start a timer for ${formatDuration(intent.args.seconds)}` };
    }

    case 'set_alarm': {
      if (platform !== 'android') return androidOnly('alarm');
      const step: PlanStep = { kind: 'alarm', hour: intent.args.hour, minute: intent.args.minute };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'flashlight': {
      if (platform !== 'android') return androidOnly('flashlight');
      const step: PlanStep = { kind: 'torch', on: intent.args.on };
      return { ok: true, steps: [step], summary: describeStep(step) };
    }

    case 'like': {
      // A like acts on what is on screen, so it never opens an app on its own.
      const named = intent.args.app ? findProfile(intent.args.app, profiles) : undefined;
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
      const app = findProfile(intent.args.app, profiles);
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
