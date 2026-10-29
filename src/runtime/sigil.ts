import { AppState, PermissionsAndroid, Platform } from 'react-native';

import type { ControlAction } from '../../modules/sigil-control';
import { MockSpeechToText } from '../adapters/voice/mock-speech';
import { NativeSpeechToText } from '../adapters/voice/native-speech';
import { SpeechUnavailableError, type SpeechToText } from '../adapters/voice/speech-to-text';
import { ProfileRegistry } from '../app-profiles/registry';
import { sampleRecordings, type HandRecording } from '../gesture-engine/samples';
import { flattenLandmarks } from '../gesture-engine/landmarks';
import { HandControl, type NativeHandFrame } from '../hand-control/controller';
import { readSettings, updateSettings } from '../settings/store';
import { ActionPlanner } from '../sigil-core/planner';
import { PlanExecutor, type SigilInterface } from '../sigil-core/executor';
import { foregroundApp, getSystemControl, installedApps, planPlatform, requestControlPermissions } from '../system-control';
import { getNativeControl, type NativeControl } from '../system-control/native';
import type { SigilUi } from '../system-control/dispatch';
import { VoiceSession, type VoiceState } from '../voice/session';

export interface SigilState {
  /** The camera service runs: tracking, cursor and bubble. */
  running: boolean;
  paused: boolean;
  /** A hand is in view of the camera right now. */
  handVisible: boolean;
  /** The demo hand plays instead of the camera, for showing and testing the cursor. */
  demo: boolean;
  /** Voice requests may use the microphone while other apps are in front. */
  microphone: boolean;
  /** A special access a gesture needed and the user has not granted yet. */
  needsAccess: 'write_settings' | 'media_access' | null;
  error: string | null;
}

export type StartProblem = 'camera_permission' | 'unavailable' | 'failed';

export interface SigilHost {
  /** Shows the Control Sphere on Sigil's own screen. */
  openSphere(): void;
  openTutorial(): void;
  /** BCP 47 locale of the app language. */
  locale(): string;
}

/** A recognizer that is not on the phone needs the user's consent, kept in the settings file. */
function allowOffDevice(): boolean {
  return readSettings().speech?.allowOffDevice === true;
}

/** Where voice requests are heard: the Android recognizer, the mock in development, or nothing. */
function createSpeech(native: NativeControl | null): SpeechToText {
  if (native) return new NativeSpeechToText(native, allowOffDevice);
  if (__DEV__) return new MockSpeechToText(['open YouTube', 'scroll down', 'go back']);
  return {
    id: 'none',
    onDevice: true,
    isAvailable: async () => false,
    listen: async () => {
      throw new SpeechUnavailableError('no_recognizer');
    },
  };
}

const DEMO_SAMPLES = ['point', 'pinch', 'circle-cw', 'pinch-hold', 'open-palm'];
const FRAME_MS = 33;

/**
 * Everything that keeps working while other apps are in front: live hand
 * control, the floating bubble, the cursor and voice requests. One instance
 * lives for the whole app; screens read its state and call its actions.
 */
export class Sigil {
  readonly profiles = ProfileRegistry.withBuiltins();
  readonly planner = new ActionPlanner({ profiles: this.profiles, installedApps, platform: planPlatform() });
  readonly native = getNativeControl();
  /** The speech engine of this build, for the voice session and the tutorial's dry run. */
  readonly speech: SpeechToText;
  readonly voice: VoiceSession;
  private readonly hands: HandControl | null;
  private readonly listeners = new Set<(state: SigilState) => void>();
  private readonly subscriptions: { remove(): void }[] = [];
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  private state: SigilState;

  constructor(private readonly host: SigilHost) {
    const status = this.native?.getStatus();
    this.state = {
      running: status?.cameraServiceRunning ?? false,
      paused: status?.trackingPaused ?? false,
      handVisible: false,
      demo: false,
      microphone: readSettings().voice?.microphone === true,
      needsAccess: null,
      error: null,
    };
    const ui: SigilInterface = {
      sphere: (action) => (action === 'open' ? this.host.openSphere() : undefined),
      tutorial: () => this.host.openTutorial(),
    };
    this.speech = createSpeech(this.native);
    this.voice = new VoiceSession({
      speech: this.speech,
      planner: this.planner,
      runner: {
        run: (plan, confirm, onStep, signal) =>
          new PlanExecutor({ device: getSystemControl().device, profiles: this.profiles, confirm, onStep, ui }).run(plan, signal),
      },
      locale: () => this.host.locale(),
      foreground: () => foregroundApp(),
    });
    this.hands = this.native ? this.createHands(this.native) : null;
    if (this.native) this.listen(this.native);
    this.subscriptions.push({ remove: this.voice.subscribe((voice) => this.syncBubble(voice)) });
  }

  get current(): SigilState {
    return this.state;
  }

  subscribe(listener: (state: SigilState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(change: Partial<SigilState>): void {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener(this.state));
  }

  private createHands(native: NativeControl): HandControl {
    const ui: SigilUi = {
      sphere: (action) => {
        if (action === 'close') return;
        if (AppState.currentState === 'active') this.host.openSphere();
        else void native.openApp(native.getStatus().packageName, 'sigil://control/sphere', null);
      },
      listen: () => void this.voice.start(),
      cursor: (action) => {
        if (action === 'toggle') native.hideCursor();
      },
      pause: () => this.pause(!this.state.paused),
      needsAccess: (access) => this.set({ needsAccess: access }),
    };
    return new HandControl({
      native,
      profiles: this.profiles,
      ui,
      screen: native.getScreenSize(),
      foreground: () => foregroundApp(),
      voiceGesture: (kind) => this.voice.gesture(kind),
    });
  }

  private listen(native: NativeControl): void {
    this.subscriptions.push(
      native.addListener('onHandFrame', (frame) => {
        if (!this.state.demo) this.push(frame);
      }),
      native.addListener('onCameraServiceStateChanged', (event) => {
        this.set({
          running: event.running,
          paused: event.paused ?? false,
          error: event.error ?? null,
          ...(event.running ? {} : { handVisible: false, demo: false }),
        });
        if (!event.running) this.stopDemoTimer();
      }),
      native.addListener('onControlAction', (event) => this.onControlAction(event.action)),
    );
  }

  private push(frame: NativeHandFrame): void {
    this.hands?.push(frame);
    const visible = frame.landmarks.length > 0;
    if (visible !== this.state.handVisible) {
      this.set({ handVisible: visible });
      this.syncBubble(this.voice.current);
    }
  }

  private syncBubble(voice: VoiceState): void {
    if (!this.native || !this.state.running) return;
    const listening = voice.phase === 'listening' || voice.phase === 'confirm' || voice.phase === 'choose';
    this.native.setBubbleState(this.state.paused ? 'paused' : listening ? 'listening' : this.state.handVisible ? 'hand' : 'tracking');
  }

  private onControlAction(action: ControlAction): void {
    if (action === 'microphone') {
      void this.setMicrophone(!this.state.microphone);
    } else if (action === 'stop') {
      this.stopDemoTimer();
      this.set({ running: false, demo: false, handVisible: false });
    }
  }

  /** Starts hands free control: permissions, then the camera service with the cursor and the bubble. */
  async start(): Promise<StartProblem | null> {
    const native = this.native;
    if (!native || Platform.OS !== 'android') return 'unavailable';
    const granted = await requestControlPermissions({ microphone: this.state.microphone });
    if (!granted.camera) return 'camera_permission';
    if (!native.startCameraService(this.state.microphone && granted.microphone)) return 'failed';
    this.set({ running: true, error: null });
    return null;
  }

  stop(): void {
    this.stopDemoTimer();
    this.native?.stopCameraService();
    this.native?.hideCursor();
    this.set({ running: false, demo: false, handVisible: false, paused: false });
  }

  pause(paused: boolean): void {
    if (this.native?.setTrackingPaused(paused)) {
      this.set({ paused });
      if (paused) this.native.hideCursor();
    }
  }

  /** Voice over other apps needs the microphone in the camera service; it restarts with or without it. */
  async setMicrophone(on: boolean): Promise<void> {
    if (on && Platform.OS === 'android') {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (result !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    updateSettings({ voice: { ...readSettings().voice, microphone: on } });
    this.set({ microphone: on });
    if (this.state.running && this.native) this.native.startCameraService(on);
  }

  /**
   * Plays recorded hand gestures instead of the camera: the cursor moves and
   * the bubble shows a hand, but demo frames never tap or act on apps. Used to
   * show the cursor and by the emulator smoke test, which has no real hand.
   */
  async startDemo(): Promise<void> {
    if (!this.hands) return;
    if (!this.state.running) await this.start();
    const frames = demoFrames(sampleRecordings().filter((recording) => DEMO_SAMPLES.includes(recording.id)));
    if (frames.length === 0) return;
    this.stopDemoTimer();
    this.set({ demo: true });
    let index = 0;
    let offset = 0;
    const loop = frames[frames.length - 1].t + 400;
    this.demoTimer = setInterval(() => {
      const frame = frames[index];
      this.push({ ...frame, t: frame.t + offset, synthetic: true });
      index++;
      if (index >= frames.length) {
        index = 0;
        offset += loop;
      }
    }, FRAME_MS);
  }

  stopDemo(): void {
    this.stopDemoTimer();
    this.set({ demo: false, handVisible: false });
    this.native?.hideCursor();
  }

  private stopDemoTimer(): void {
    if (this.demoTimer) clearInterval(this.demoTimer);
    this.demoTimer = null;
  }

  dispose(): void {
    this.stopDemoTimer();
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions.length = 0;
  }
}

/** The recordings one after another on one clock, as the native tracker would send them. */
export function demoFrames(recordings: readonly HandRecording[]): NativeHandFrame[] {
  const out: NativeHandFrame[] = [];
  let offset = 0;
  for (const recording of recordings) {
    for (const frame of recording.frames) {
      out.push({
        t: frame.t + offset,
        landmarks: frame.landmarks ? flattenLandmarks(frame.landmarks) : [],
        score: frame.score ?? 1,
        handedness: null,
      });
    }
    const last = recording.frames[recording.frames.length - 1];
    offset += (last?.t ?? 0) + 500;
  }
  return out;
}
