import { useSyncExternalStore } from 'react';
import { AppState, Linking, PermissionsAndroid, Platform, type NativeEventSubscription } from 'react-native';

import { createSpeechToText, ListenAbortedError } from '../adapters/voice';
import { ProfileRegistry } from '../app-profiles';
import { GestureClassifier, gestureKey, unflattenLandmarks } from '../gesture-engine';
import { ActionPlanner } from '../sigil-core';
import { getNativeControl, getSystemControl, readLevels, requestControlPermissions } from '../system-control';
import type { ChecklistItem, SessionActions, SessionState } from './types';

/**
 * Provisional Sigil session, built only on what the app has today: the
 * Android control module (camera service, cursor, settings shortcuts and
 * levels) and the mock speech engine with the rule planner. The native work
 * replaces this file with the real session; the screens use only the
 * contract in ./types.
 *
 * Where the Android module is missing (the web, Expo Go, iOS) it runs a
 * preview that behaves like a fresh Android install, so every screen and
 * state can be seen and tested.
 */

export type { ChecklistItem, SessionActions, SessionPhase, SessionState } from './types';

const ALL_MISSING: Record<ChecklistItem, boolean> = {
  accessibility: false,
  overlay: false,
  camera: false,
  microphone: false,
  notifications: false,
  restrictedSettings: false,
};

const INITIAL: SessionState = {
  phase: 'off',
  hand: 'none',
  listening: false,
  micLevel: 0,
  lastGesture: null,
  lastCommand: null,
  checklist: ALL_MISSING,
  levels: { volume: null, brightness: null },
  error: null,
};

const LEVELS_MS = 1000;
const MIC_MS = 90;

type Listener = () => void;

class SessionStore implements SessionActions {
  private state: SessionState = INITIAL;
  private readonly listeners = new Set<Listener>();
  private readonly native = Platform.OS === 'android' ? getSystemControl().native ?? getNativeControl() : null;
  private readonly preview = this.native === null;
  private subscriptions: { remove(): void }[] = [];
  private appState: NativeEventSubscription | null = null;
  private levelsTimer: ReturnType<typeof setInterval> | null = null;
  private micTimer: ReturnType<typeof setInterval> | null = null;
  private listenAbort: AbortController | null = null;
  private classifier: GestureClassifier | null = null;
  private planner: ActionPlanner | null = null;

  constructor() {
    if (this.preview) {
      this.state = { ...INITIAL, levels: { volume: 0.62, brightness: 0.74 } };
    } else if (this.native) {
      const status = this.native.getStatus();
      this.state = { ...INITIAL, phase: status.cameraServiceRunning ? 'tracking' : 'off' };
    }
  }

  getSnapshot = (): SessionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.activate();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.deactivate();
    };
  };

  private set(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private activate(): void {
    this.refreshChecklist();
    this.refreshLevels();
    this.levelsTimer = setInterval(() => {
      if (AppState.currentState === 'active') this.refreshLevels();
    }, LEVELS_MS);
    this.appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        this.refreshChecklist();
        this.refreshLevels();
      }
    });
    const native = this.native;
    if (native) {
      this.subscriptions = [
        native.addListener('onServiceStateChanged', () => this.refreshChecklist()),
        native.addListener('onCameraServiceStateChanged', (event) => {
          if (event.running) {
            if (this.state.phase === 'starting' || this.state.phase === 'off') this.set({ phase: 'tracking', error: null });
          } else if (this.state.phase === 'tracking' || this.state.phase === 'starting') {
            this.set({ phase: event.error ? 'error' : 'off', hand: 'none', error: event.error ?? null });
          }
        }),
        native.addListener('onHandFrame', (event) => this.onHandFrame(event.t, event.landmarks, event.score)),
      ];
    }
  }

  private deactivate(): void {
    if (this.levelsTimer) clearInterval(this.levelsTimer);
    this.levelsTimer = null;
    this.appState?.remove();
    this.appState = null;
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
  }

  private onHandFrame(t: number, values: number[], score: number): void {
    if (this.state.phase !== 'tracking') return;
    const landmarks = values.length > 0 && score >= 0.5 ? unflattenLandmarks(values) : null;
    const hand = landmarks ? 'right' : 'none';
    if (hand !== this.state.hand) this.set({ hand });
    this.classifier ??= new GestureClassifier();
    const events = this.classifier.push({ t, landmarks, score });
    const last = events.filter((event) => event.phase !== 'end').pop();
    if (last) this.set({ lastGesture: gestureKey(last) });
  }

  private async refreshChecklist(): Promise<void> {
    const native = this.native;
    if (!native) return;
    try {
      const status = native.getStatus();
      const { PERMISSIONS } = PermissionsAndroid;
      const [camera, microphone] = await Promise.all([
        PermissionsAndroid.check(PERMISSIONS.CAMERA),
        PermissionsAndroid.check(PERMISSIONS.RECORD_AUDIO),
      ]);
      this.set({
        checklist: {
          accessibility: status.accessibilityEnabled,
          overlay: status.overlayPermission,
          camera,
          microphone,
          notifications: status.mediaAccess,
          // Android 13 blocks the accessibility switch of sideloaded apps until restricted settings are allowed.
          restrictedSettings: status.accessibilityEnabled || status.sdkInt < 33,
        },
      });
    } catch {
      // The module answers again on the next resume.
    }
  }

  private async refreshLevels(): Promise<void> {
    if (this.preview) return;
    const levels = await readLevels(this.native);
    const volume = levels.muted ? 0 : levels.volume;
    if (volume !== this.state.levels.volume || levels.brightness !== this.state.levels.brightness) {
      this.set({ levels: { volume, brightness: levels.brightness } });
    }
  }

  start = async (): Promise<void> => {
    if (this.state.phase === 'starting' || this.state.phase === 'tracking') return;
    this.set({ phase: 'starting', error: null });
    if (this.preview) {
      setTimeout(() => this.set({ phase: 'tracking' }), 700);
      setTimeout(() => {
        if (this.state.phase === 'tracking') this.set({ hand: 'right' });
      }, 1300);
      this.startDemoGestures();
      return;
    }
    const native = this.native;
    if (!native) return;
    const granted = await requestControlPermissions({ microphone: false });
    if (!granted.camera) {
      this.set({ phase: 'error', error: 'camera_permission' });
      this.refreshChecklist();
      return;
    }
    if (!native.startCameraService(false)) {
      this.set({ phase: 'error', error: 'camera_service' });
      return;
    }
    native.showCursor();
    this.classifier = new GestureClassifier();
    this.set({ phase: 'tracking' });
    this.refreshChecklist();
  };

  private demoTimer: ReturnType<typeof setInterval> | null = null;

  /** The preview has no camera; it reports a short loop of gestures while tracking. */
  private startDemoGestures(): void {
    if (this.demoTimer) clearInterval(this.demoTimer);
    const loop = ['point', 'pinch', 'swipe_two_up', 'pinch_circle_cw', 'open_palm', 'fist'];
    let index = 0;
    this.demoTimer = setInterval(() => {
      if (this.state.phase !== 'tracking') return;
      this.set({ lastGesture: loop[index % loop.length] });
      index += 1;
    }, 4200);
  }

  private halt(phase: 'off' | 'paused'): void {
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null;
    const native = this.native;
    if (native) {
      native.stopCameraService();
      native.hideCursor();
    }
    this.set({ phase, hand: 'none', error: null });
  }

  stop = (): void => this.halt('off');

  pause = (): void => this.halt('paused');

  resume = (): void => {
    void this.start();
  };

  listen = (): void => {
    if (this.state.listening) return;
    const abort = new AbortController();
    this.listenAbort = abort;
    this.set({ listening: true, micLevel: 0 });
    let phase = 0;
    this.micTimer = setInterval(() => {
      phase += 1;
      const voice = 0.35 + 0.3 * Math.abs(Math.sin(phase * 0.55)) + 0.2 * Math.abs(Math.sin(phase * 1.7));
      this.set({ micLevel: Math.min(1, voice) });
    }, MIC_MS);
    void this.hear(abort);
  };

  private async hear(abort: AbortController): Promise<void> {
    const at = Date.now();
    try {
      const transcript = await createSpeechToText().listen({ locale: 'en-US', signal: abort.signal });
      this.planner ??= new ActionPlanner({ profiles: ProfileRegistry.withBuiltins() });
      const outcome = await this.planner.plan({ text: transcript.text, locale: transcript.locale });
      const result = outcome.status === 'planned' ? 'done' : outcome.status === 'blocked' ? 'cancelled' : 'not_understood';
      this.set({ lastCommand: { text: transcript.text, at: Date.now(), outcome: result } });
    } catch (error) {
      if (!(error instanceof ListenAbortedError)) {
        this.set({ lastCommand: { text: '', at, outcome: 'failed' } });
      }
    } finally {
      if (this.micTimer) clearInterval(this.micTimer);
      this.micTimer = null;
      if (this.listenAbort === abort) this.listenAbort = null;
      this.set({ listening: false, micLevel: 0 });
    }
  }

  stopListening = (): void => {
    this.listenAbort?.abort();
  };

  fix = (item: ChecklistItem): void => {
    if (this.preview) {
      setTimeout(() => this.set({ checklist: { ...this.state.checklist, [item]: true } }), 400);
      return;
    }
    const native = this.native;
    if (!native) return;
    switch (item) {
      case 'camera':
        void requestControlPermissions({ microphone: false }).then(() => this.refreshChecklist());
        break;
      case 'microphone':
        void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO).then(() => this.refreshChecklist());
        break;
      case 'accessibility':
        native.openAccessibilitySettings();
        break;
      case 'overlay':
        native.openOverlaySettings();
        break;
      case 'notifications':
        native.openMediaAccessSettings();
        break;
      case 'restrictedSettings':
        void Linking.openSettings();
        break;
    }
  };

  setVolume = async (percent: number): Promise<void> => {
    const level = Math.max(0, Math.min(100, Math.round(percent)));
    if (this.preview) {
      this.set({ levels: { ...this.state.levels, volume: level / 100 } });
      return;
    }
    const native = this.native;
    if (!native) return;
    try {
      await native.changeVolume('media', 'set', level);
    } finally {
      await this.refreshLevels();
    }
  };

  setBrightness = async (percent: number): Promise<void> => {
    const level = Math.max(0, Math.min(100, Math.round(percent)));
    if (this.preview) {
      this.set({ levels: { ...this.state.levels, brightness: level / 100 } });
      return;
    }
    const native = this.native;
    if (!native) return;
    try {
      const outcome = await native.changeBrightness('set', level);
      if (outcome === 'write_settings') native.openWriteSettings();
    } finally {
      await this.refreshLevels();
    }
  };
}

let store: SessionStore | null = null;

function session(): SessionStore {
  store ??= new SessionStore();
  return store;
}

export function useSigilSession(): SessionState & SessionActions {
  const current = session();
  const state = useSyncExternalStore(current.subscribe, current.getSnapshot, current.getSnapshot);
  return {
    ...state,
    start: current.start,
    stop: current.stop,
    pause: current.pause,
    resume: current.resume,
    listen: current.listen,
    stopListening: current.stopListening,
    fix: current.fix,
    setVolume: current.setVolume,
    setBrightness: current.setBrightness,
  };
}
