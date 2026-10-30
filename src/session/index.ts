import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useMemo, useSyncExternalStore } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';

import { resolveLanguage, speechLocaleFor, type AppLanguage, type DeviceLocale } from '../i18n/languages';
import { loadLanguageChoice } from '../i18n/storage';
import { Sigil } from '../runtime/sigil';
import { foregroundApp, getSystemControl, readLevels, requestControlPermissions } from '../system-control';
import { isListening, micLevel, sessionPhase } from './state';
import type { ChecklistItem, PlanRequestResult, SessionActions, SessionState } from './types';

export type { ChecklistItem, PlanRequestResult, SessionActions, SessionPhase, SessionState } from './types';

/** Screens can say where the Control Sphere and the tour are; until then both lead home. */
const handlers = {
  openSphere: () => router.navigate('/'),
  openTutorial: () => router.navigate('/'),
};

export function setSessionHandlers(next: Partial<typeof handlers>): void {
  Object.assign(handlers, next);
}

/** Shows the Control Sphere where the screens put it, as the bubble and the open palm do. */
export function openControlSphere(): void {
  handlers.openSphere();
}

function deviceLocales(): DeviceLocale[] {
  return getLocales().map((locale) => ({
    languageTag: locale.languageTag,
    languageCode: locale.languageCode ?? null,
    regionCode: locale.regionCode ?? null,
    languageScriptCode: locale.languageScriptCode ?? null,
  }));
}

/** The app language outside React: the saved choice, or the phone language. */
function appLanguage(locales: DeviceLocale[] = deviceLocales()): AppLanguage {
  const choice = loadLanguageChoice();
  return choice === 'system' ? resolveLanguage(locales) : choice;
}

/** BCP 47 locale of the app language, for speech and the planner. */
function appLocale(): string {
  const locales = deviceLocales();
  return speechLocaleFor(appLanguage(locales), locales);
}

let sigil: Sigil | null = null;

/** The one runtime of the app: hand control, bubble, voice. Created on first use. */
export function getSigil(): Sigil {
  sigil ??= new Sigil({
    openSphere: () => handlers.openSphere(),
    openTutorial: () => handlers.openTutorial(),
    locale: appLocale,
    language: () => appLanguage(),
  });
  return sigil;
}

const NOT_READY: Record<ChecklistItem, boolean> = {
  accessibility: false,
  overlay: false,
  camera: false,
  microphone: false,
  notifications: false,
  restrictedSettings: false,
};

async function readChecklist(): Promise<Record<ChecklistItem, boolean>> {
  const native = getSigil().native;
  if (!native || Platform.OS !== 'android') return NOT_READY;
  const status = native.getStatus();
  const { PERMISSIONS } = PermissionsAndroid;
  const check = (permission: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]) => PermissionsAndroid.check(permission).catch(() => false);
  let restricted = false;
  try {
    restricted = !status.accessibilityEnabled && native.getInstallSource().restrictedSettings;
  } catch {
    restricted = false;
  }
  const notifications = typeof Platform.Version === 'number' && Platform.Version >= 33 ? await check(PERMISSIONS.POST_NOTIFICATIONS) : true;
  return {
    accessibility: status.accessibilityEnabled,
    overlay: status.overlayPermission,
    camera: await check(PERMISSIONS.CAMERA),
    microphone: await check(PERMISSIONS.RECORD_AUDIO),
    notifications,
    restrictedSettings: !restricted,
  };
}

/** Polls the checklist and the levels only while a screen shows the session. */
const POLL_MS = 1500;

class SessionStore {
  private snapshot: SessionState | null = null;
  private readonly listeners = new Set<() => void>();
  private checklist: Record<ChecklistItem, boolean> = NOT_READY;
  private levels: SessionState['levels'] = { volume: null, brightness: null };
  private startError: string | null = null;
  private teardown: (() => void) | null = null;

  getSnapshot = (): SessionState => {
    this.snapshot ??= this.compute();
    return this.snapshot;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.connect();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.disconnect();
    };
  };

  /** Recomputes the state and tells the screens. */
  changed = (): void => {
    this.snapshot = this.compute();
    this.listeners.forEach((listener) => listener());
  };

  setStartError(error: string | null): void {
    this.startError = error;
    this.changed();
  }

  refresh = async (): Promise<void> => {
    const native = getSigil().native;
    const [checklist, levels] = await Promise.all([readChecklist(), readLevels(native)]);
    this.checklist = checklist;
    this.levels = { volume: levels.volume, brightness: levels.brightness };
    this.changed();
  };

  private compute(): SessionState {
    const runtime = getSigil();
    const state = runtime.current;
    const voice = runtime.voice.current;
    return {
      phase: sessionPhase(state, this.startError),
      hand: state.hand,
      listening: isListening(voice),
      micLevel: micLevel(voice),
      lastGesture: state.lastGesture,
      lastCommand: state.lastCommand,
      checklist: this.checklist,
      levels: this.levels,
      error: this.startError ?? state.error,
      condition: state.running ? state.condition : 'ok',
    };
  }

  private connect(): void {
    const runtime = getSigil();
    const unsubscribeRuntime = runtime.subscribe(this.changed);
    const unsubscribeVoice = runtime.voice.subscribe(this.changed);
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void this.refresh();
    });
    const accessibility = runtime.native?.addListener('onServiceStateChanged', () => void this.refresh());
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void this.refresh();
    }, POLL_MS);
    void this.refresh();
    this.teardown = () => {
      unsubscribeRuntime();
      unsubscribeVoice();
      appState.remove();
      accessibility?.remove();
      clearInterval(timer);
    };
  }

  private disconnect(): void {
    this.teardown?.();
    this.teardown = null;
  }
}

const store = new SessionStore();

const START_ERRORS: Record<string, string> = {
  camera_permission: 'camera_permission',
  unavailable: 'unavailable',
  failed: 'failed',
};

/** The actions of the session, also usable outside React (the bubble menu, links from the tile and the widget). */
export const sessionActions: SessionActions = {
  async start() {
    store.setStartError(null);
    const problem = await getSigil().start();
    store.setStartError(problem ? START_ERRORS[problem] : null);
    void store.refresh();
  },
  stop() {
    getSigil().stop();
    store.setStartError(null);
  },
  pause() {
    getSigil().pause(true);
  },
  resume() {
    getSigil().pause(false);
  },
  listen() {
    void getSigil().voice.start();
  },
  stopListening() {
    getSigil().voice.cancel();
  },
  fix(item) {
    const native = getSigil().native;
    const { PERMISSIONS } = PermissionsAndroid;
    const after = () => void store.refresh();
    switch (item) {
      case 'accessibility':
        native?.openAccessibilitySettings();
        return;
      case 'overlay':
        native?.openOverlaySettings();
        return;
      case 'restrictedSettings':
        native?.openAppInfo();
        return;
      case 'camera':
        void requestControlPermissions({ microphone: false }).then(after);
        return;
      case 'microphone':
        if (Platform.OS === 'android') void PermissionsAndroid.request(PERMISSIONS.RECORD_AUDIO).then(after);
        return;
      case 'notifications':
        if (Platform.OS === 'android') void PermissionsAndroid.request(PERMISSIONS.POST_NOTIFICATIONS).then(after);
        return;
    }
  },
  async setVolume(percent) {
    await getSystemControl().device.volume({ stream: 'media', action: 'set', level: Math.round(percent) });
    await store.refresh();
  },
  async setBrightness(percent) {
    await getSystemControl().device.brightness({ action: 'set', level: Math.round(percent) });
    await store.refresh();
  },
};

/** The shared session for screens: the same phase the bubble, the tile and the widget show. */
export function useSigilSession(): SessionState & SessionActions {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return useMemo(() => ({ ...state, ...sessionActions }), [state]);
}

/**
 * Plans a typed or spoken request. A dry run only plans and returns the
 * outcome, as the tour does; otherwise the voice session carries it out, with
 * the same questions and confirmations as a spoken request, and the result
 * comes back too.
 */
export async function planRequest(text: string, options: { dryRun?: boolean } = {}): Promise<PlanRequestResult> {
  const runtime = getSigil();
  if (options.dryRun !== false || runtime.voice.busy) {
    const outcome = await runtime.planner.plan({ text, locale: appLocale(), foregroundPackage: foregroundApp() });
    return { outcome, result: null };
  }
  await runtime.voice.startTyped(text);
  const state = runtime.voice.current;
  if (state.phase === 'done') return { outcome: state.outcome, result: state.result };
  const outcome = await runtime.planner.plan({ text, locale: appLocale(), foregroundPackage: foregroundApp() });
  return { outcome, result: null };
}
