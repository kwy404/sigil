import { AppRegistry, AppState, PermissionsAndroid, Platform } from 'react-native';

import type { ControlAction } from '../../modules/sigil-control';
import { getOnDeviceModel } from '../adapters/model/platform';
import { MockSpeechToText, NativeSpeechToText, SpeechUnavailableError, type SpeechToText } from '../adapters/voice';
import { ProfileRegistry } from '../app-profiles/registry';
import { gestureKey } from '../gesture-engine/gestures';
import { sampleRecordings, type HandRecording } from '../gesture-engine/samples';
import { flattenLandmarks } from '../gesture-engine/landmarks';
import { HandControl, type NativeHandFrame } from '../hand-control/controller';
import { appNameResolver, MESSAGES, numberFormatter, type AppLanguage, type DescribeContext } from '../i18n';
import { readSettings, updateSettings } from '../settings/store';
import { ActionPlanner } from '../sigil-core/planner';
import { PlanExecutor, type SigilInterface } from '../sigil-core/executor';
import { foregroundApp, getSystemControl, installedApps, planPlatform, requestControlPermissions } from '../system-control';
import { getNativeControl, type NativeControl } from '../system-control/native';
import type { SigilUi } from '../system-control/dispatch';
import { VoiceSession, type VoiceState } from '../voice/session';
import { judgeSelfTest, SelfTestProbe, type SelfTestVerdict, type TrackerSelfTest } from './self-test';
import { endsRequest, PANEL_LINGER_MS, voicePanel, type PanelContent } from './voice-panel';

export interface SigilState {
  /** The camera service runs: tracking, cursor and bubble. */
  running: boolean;
  paused: boolean;
  /** start() is asking for permissions or starting the camera service. */
  starting: boolean;
  /** A hand is in view of the camera right now. */
  handVisible: boolean;
  /** Which hand, as the tracker reports it; right when it does not say. */
  hand: 'none' | 'left' | 'right';
  /** The last gesture the classifier recognized, as a profile key. */
  lastGesture: string | null;
  /** The last request heard or typed and how it ended. */
  lastCommand: LastCommand | null;
  /** The demo hand plays instead of the camera, for showing and testing the cursor. */
  demo: boolean;
  /** Voice requests may use the microphone while other apps are in front. */
  microphone: boolean;
  /** A special access a gesture needed and the user has not granted yet. */
  needsAccess: 'write_settings' | 'media_access' | null;
  /** The last self test of the hand tracker and the gesture engine, or null. */
  selfTest: SelfTestVerdict | null;
  error: string | null;
}

export type StartProblem = 'camera_permission' | 'unavailable' | 'failed';

export interface LastCommand {
  text: string;
  at: number;
  outcome: 'done' | 'failed' | 'cancelled' | 'not_understood';
}

/** How a finished voice request reads in the session: done, failed, cancelled or not understood. Null while it runs. */
export function commandOutcome(state: VoiceState, busy: boolean): LastCommand | null {
  const at = Date.now();
  switch (state.phase) {
    case 'done': {
      const status = state.outcome.status;
      if (status === 'not_understood') return { text: state.heard, at, outcome: 'not_understood' };
      if (status !== 'planned' || !state.result) return { text: state.heard, at, outcome: 'failed' };
      const result = state.result.status;
      return { text: state.heard, at, outcome: result === 'completed' ? 'done' : result === 'cancelled' ? 'cancelled' : 'failed' };
    }
    case 'repeat':
      return busy ? null : { text: '', at, outcome: 'not_understood' };
    case 'cancelled':
      return { text: '', at, outcome: 'cancelled' };
    case 'unavailable':
      return { text: '', at, outcome: 'failed' };
    default:
      return null;
  }
}

export interface SigilHost {
  /** Shows the Control Sphere on Sigil's own screen. */
  openSphere(): void;
  openTutorial(): void;
  /** BCP 47 locale of the app language. */
  locale(): string;
  /** The app language, for the texts of the voice panel over other apps. */
  language(): AppLanguage;
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
 * React Native pauses JavaScript timers while Sigil's screen is in the
 * background, unless a headless task runs. Plan steps, voice questions and
 * the demo hand wait on timers, so the native module keeps this task while the
 * camera service runs. It does no work of its own and ends when Sigil stops.
 */
const KEEP_ALIVE_TASK = 'SigilKeepAlive';
let releaseKeepAlive: (() => void) | null = null;
if (Platform.OS === 'android') {
  AppRegistry.registerHeadlessTask(KEEP_ALIVE_TASK, () => () =>
    new Promise<void>((resolve) => {
      releaseKeepAlive?.();
      releaseKeepAlive = resolve;
    }),
  );
}

/**
 * Everything that keeps working while other apps are in front: live hand
 * control, the floating bubble, the cursor and voice requests. One instance
 * lives for the whole app; screens read its state and call its actions.
 */
export class Sigil {
  readonly profiles = ProfileRegistry.withBuiltins();
  /** Plans with the on device model when one is downloaded and loaded, and with the rules otherwise. */
  readonly planner = new ActionPlanner({
    profiles: this.profiles,
    installedApps,
    platform: planPlatform(),
    model: getOnDeviceModel().plannerModel,
    modelTimeoutMs: () => getOnDeviceModel().plannerTimeoutMs(),
  });
  readonly native = getNativeControl();
  /** The speech engine of this build, for the voice session and the tutorial's dry run. */
  readonly speech: SpeechToText;
  readonly voice: VoiceSession;
  private readonly hands: HandControl | null;
  private readonly listeners = new Set<(state: SigilState) => void>();
  private readonly subscriptions: { remove(): void }[] = [];
  private demoTimer: ReturnType<typeof setInterval> | null = null;
  /** Collects what the gesture engine makes of the self test photos while the test runs. */
  private probe: SelfTestProbe | null = null;
  /** What the voice panel over other apps shows, and the timer that hides it after a request. */
  private panel: PanelContent | null = null;
  private panelTimer: ReturnType<typeof setTimeout> | null = null;
  private state: SigilState;

  constructor(private readonly host: SigilHost) {
    const status = this.native?.getStatus();
    this.state = {
      running: status?.cameraServiceRunning ?? false,
      paused: status?.trackingPaused ?? false,
      starting: false,
      handVisible: false,
      hand: 'none',
      lastGesture: null,
      lastCommand: null,
      demo: false,
      // On unless the user turned it off: without it, voice requests over other apps hear nothing.
      microphone: readSettings().voice?.microphone !== false,
      needsAccess: null,
      selfTest: null,
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
    if (this.state.running) this.keepAlive(true);
    let wasBusy = false;
    this.subscriptions.push({
      remove: this.voice.subscribe((voice) => {
        this.syncBubble(voice);
        this.syncPanel(voice);
        // A request ended: remember what it was and how it went.
        const busy = this.voice.busy;
        if (wasBusy && !busy) {
          const command = commandOutcome(voice, false);
          if (command) this.set({ lastCommand: command });
        }
        wasBusy = busy;
      }),
    });
  }

  get current(): SigilState {
    return this.state;
  }

  subscribe(listener: (state: SigilState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(change: Partial<SigilState>): void {
    const wasRunning = this.state.running;
    this.state = { ...this.state, ...change };
    if (this.state.running !== wasRunning) this.keepAlive(this.state.running);
    this.listeners.forEach((listener) => listener(this.state));
  }

  /** Keeps JavaScript timers alive in the background while the camera service runs (see KEEP_ALIVE_TASK). */
  private keepAlive(on: boolean): void {
    if (!this.native || Platform.OS !== 'android') return;
    this.native.setKeepAlive(on);
    if (!on) {
      releaseKeepAlive?.();
      releaseKeepAlive = null;
    }
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
          ...(event.running ? {} : { handVisible: false, hand: 'none' as const, demo: false }),
        });
        if (!event.running) this.stopDemoTimer();
      }),
      native.addListener('onControlAction', (event) => this.onControlAction(event.action)),
      // Sigil's screen shows the voice state; the panel takes over when another app comes in front.
      AppState.addEventListener('change', () => this.syncPanel(this.voice.current)),
    );
  }

  private push(frame: NativeHandFrame): void {
    const events = this.hands?.push(frame) ?? [];
    if (frame.fixture && this.probe && this.hands) {
      const snapshot = this.hands.snapshot;
      this.probe.record(frame.fixture, snapshot.pose, snapshot.handVisible, snapshot.screenCursor, events);
    }
    const visible = frame.landmarks.length > 0;
    const hand = visible ? (frame.handedness ?? 'right') : 'none';
    const last = events.length > 0 ? gestureKey(events[events.length - 1]) : this.state.lastGesture;
    if (visible !== this.state.handVisible || hand !== this.state.hand || last !== this.state.lastGesture) {
      this.set({ handVisible: visible, hand, lastGesture: last });
      this.syncBubble(this.voice.current);
    }
  }

  /** Texts in the app language, outside React. */
  private describeContext(): DescribeContext {
    const language = this.host.language();
    const m = MESSAGES[language];
    return { m, format: numberFormatter(language), appName: appNameResolver(this.profiles, m) };
  }

  /**
   * The voice panel at the top of the screen, for requests made while another
   * app is in front: what Sigil heard, its question with the microphone level,
   * and how the request ended. Sigil's own screen shows the voice state itself.
   */
  private syncPanel(voice: VoiceState): void {
    const native = this.native;
    if (!native || Platform.OS !== 'android') return;
    if (this.panelTimer) clearTimeout(this.panelTimer);
    this.panelTimer = null;
    const busy = this.voice.busy;
    const content = AppState.currentState === 'active' ? null : voicePanel(voice, busy, this.describeContext());
    const shown = this.panel;
    this.panel = content;
    if (!content) {
      if (shown) native.hidePrompt();
      return;
    }
    if (shown && shown.title === content.title && shown.message === content.message && shown.tone === content.tone) {
      if (shown.level !== content.level) native.setPromptLevel(content.level);
    } else {
      native.showPrompt(content.title, content.message, content.level, content.tone);
    }
    if (endsRequest(voice, busy)) {
      this.panelTimer = setTimeout(() => {
        this.panelTimer = null;
        this.panel = null;
        native.hidePrompt();
      }, PANEL_LINGER_MS);
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
    this.set({ starting: true, error: null });
    try {
      const granted = await requestControlPermissions({ microphone: this.state.microphone });
      if (!granted.camera) return 'camera_permission';
      if (!native.startCameraService(this.state.microphone && granted.microphone)) return 'failed';
      this.set({ running: true });
      return null;
    } finally {
      this.set({ starting: false });
    }
  }

  stop(): void {
    this.stopDemoTimer();
    this.native?.stopCameraService();
    this.native?.hideCursor();
    this.set({ running: false, demo: false, handVisible: false, hand: 'none', paused: false });
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

  /**
   * Runs the hand tracker on MediaPipe's own test photos of hands, through the
   * same path as camera frames, and checks what the gesture engine and the
   * cursor made of them. Starts Sigil first when it is off. The verdict also
   * goes to the Android log, where the emulator test reads it.
   */
  async runSelfTest(): Promise<SelfTestVerdict | null> {
    const native = this.native;
    if (!native || Platform.OS !== 'android') return null;
    if (!this.state.running) await this.start();
    this.stopDemoTimer();
    this.set({ demo: false });
    const probe = new SelfTestProbe();
    this.probe = probe;
    let tracker: TrackerSelfTest;
    try {
      tracker = (await native.runSelfTest()) as unknown as TrackerSelfTest;
    } catch (error) {
      tracker = { passed: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      this.probe = null;
    }
    const verdict = judgeSelfTest(tracker, probe.result, native.getScreenSize().width);
    native.logSelfTest(`gestures ${verdict.passed ? 'PASS' : 'FAIL'} ${JSON.stringify(verdict)}`);
    this.set({ selfTest: verdict });
    return verdict;
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
    if (this.panelTimer) clearTimeout(this.panelTimer);
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
