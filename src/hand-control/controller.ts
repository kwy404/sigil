import type { ProfileRegistry } from '../app-profiles/registry';
import { DEFAULT_CONTROL_BOX, mapToScreen, type ControlBox, type ScreenSize } from '../gesture-engine/mapping';
import { GestureClassifier, type ClassifierSnapshot } from '../gesture-engine/classifier';
import { gestureKey, type GestureEvent } from '../gesture-engine/gestures';
import { unflattenLandmarks, type HandFrame, type Vec2 } from '../gesture-engine/landmarks';
import { dispatchProfileAction, type GestureTarget, type SigilUi } from '../system-control/dispatch';
import { inPractice, publishFrame, publishGesture } from './feed';
import {
  ActionGuard,
  CursorMotion,
  DEFAULT_SELECTION,
  HandSelector,
  LightGate,
  StabilityGate,
  type HandCandidate,
  type IgnoredReason,
  type SelectionConfig,
} from './robustness';

/** What the hand control needs from the native module; NativeControl satisfies it, tests use a fake. */
export interface HandControlNative extends GestureTarget {
  moveCursor(x: number, y: number, state: 'idle' | 'hover' | 'press' | 'drag' | 'lost'): void;
  hideCursor(): void;
  showCursor(): boolean;
}

/** One tracker result as the native module emits it. */
export interface NativeHandFrame {
  t: number;
  /** The first hand's 21 landmarks as flat x, y, z triples; empty when no hand is seen. */
  landmarks: number[];
  score: number;
  handedness: 'left' | 'right' | null;
  /** Every hand the tracker found (up to two), so the user's hand can be chosen. */
  hands?: HandCandidate[] | null;
  /** Width over height of the upright frame: 0.75 in portrait, 1.33 in landscape. */
  aspect?: number;
  /** Mean brightness of the frame from 0 to 255, or -1 when unknown. */
  brightness?: number;
  /** Frames of the demo hand and the self test: they move the cursor and reach practice screens, but never act on apps. */
  synthetic?: boolean;
  /** The self test photo the frame came from. */
  fixture?: string | null;
}

export interface HandControlOptions {
  native: HandControlNative;
  profiles: ProfileRegistry;
  ui: SigilUi;
  screen: ScreenSize;
  /** The app in front, for its gesture profile. */
  foreground: () => string | null;
  /** A voice question takes pinch and fist first. Returns true when it used the gesture. */
  voiceGesture?: (kind: 'pinch' | 'fist') => boolean;
  box?: ControlBox;
  selection?: SelectionConfig;
}

/** none: no hand; ignored: only hands that cannot be the user's; settling: a hand, not steady yet; ready: acting. */
export type HandState = 'none' | 'ignored' | 'settling' | 'ready';

export interface HandConditions {
  hand: HandState;
  ignored: IgnoredReason | null;
  /** The room is too dark: gestures wait for more light. */
  dark: boolean;
}

/** Adjustments that repeat by design while the pinch turns or slides; they are bounded and never commit anything. */
function isAdjustment(key: string): boolean {
  return key.startsWith('pinch_circle') || key.startsWith('pinch_drag');
}

/**
 * Live hand control: each camera frame goes through the gesture classifier,
 * the cursor follows the filtered fingertip, and each gesture does what the
 * profile of the app in front binds it to, so a pinch really taps where the
 * cursor is. Real rooms are messy, so only the user's hand counts (the
 * closest, whole, steady one, not someone in the background), gestures wait
 * for a steady hand and enough light, come at a human pace and never repeat
 * into a loop, and the cursor freezes and fades when the hand is lost, then
 * glides back. While a practice screen is open the gestures only go to it, and
 * while a voice question is open a pinch confirms and a fist cancels.
 */
export class HandControl {
  private classifier = new GestureClassifier();
  private aspect = 3 / 4;
  private screen: ScreenSize;
  private readonly selector: HandSelector;
  private readonly stability = new StabilityGate();
  private readonly light = new LightGate();
  private readonly guard = new ActionGuard();
  private readonly motion = new CursorMotion();
  private cursorShown = false;
  private paused = false;
  private lastCursor: Vec2 | null = null;
  private conditions: HandConditions = { hand: 'none', ignored: null, dark: false };

  constructor(private readonly options: HandControlOptions) {
    this.screen = options.screen;
    this.selector = new HandSelector(options.selection ?? DEFAULT_SELECTION);
  }

  /** Pause or resume gesture actions. The pause gesture itself still works, so the user can resume. */
  togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) this.hideCursor();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** The screen after a rotation, so the cursor covers it in every orientation. */
  setScreen(screen: ScreenSize): void {
    this.screen = screen;
  }

  /** Why the hand does or does not act right now, for the bubble and Live. */
  get condition(): HandConditions {
    return this.conditions;
  }

  /** The classifier's view of the last frame, and where it put the cursor on screen. */
  get snapshot(): ClassifierSnapshot & { screenCursor: Vec2 | null } {
    return { ...this.classifier.snapshot, screenCursor: this.lastCursor };
  }

  /** Handles one frame and returns the gestures it completed. */
  push(frame: NativeHandFrame): GestureEvent[] {
    // The frames turn with the phone; the classifier measures hands in the frame's own aspect.
    const aspect = frame.aspect && frame.aspect > 0 ? frame.aspect : this.aspect;
    if (Math.abs(aspect - this.aspect) > 0.01) {
      this.aspect = aspect;
      this.classifier = new GestureClassifier({ frameAspect: aspect });
    }
    const candidates: HandCandidate[] =
      frame.hands && frame.hands.length > 0
        ? frame.hands
        : frame.landmarks.length > 0
          ? [{ landmarks: frame.landmarks, score: frame.score, handedness: frame.handedness }]
          : [];
    const selection = this.selector.choose(candidates, aspect);
    const chosen = selection.hand;
    const landmarks = chosen ? unflattenLandmarks([...chosen.landmarks]) : null;
    const input: HandFrame = { t: frame.t, landmarks, score: chosen?.score, handedness: chosen?.handedness ?? undefined };
    const events = this.classifier.push(input);
    const steady = this.stability.update(chosen !== null, frame.t);
    const dark = this.light.update(frame.brightness, frame.t);
    this.conditions = {
      hand: chosen ? (steady ? 'ready' : 'settling') : selection.ignored ? 'ignored' : 'none',
      ignored: selection.ignored,
      dark,
    };

    const snapshot = this.classifier.snapshot;
    const box = this.options.box ?? DEFAULT_CONTROL_BOX;
    const cursor: Vec2 | null = snapshot.cursor ? mapToScreen(snapshot.cursor, box, this.screen) : null;
    this.lastCursor = cursor;
    publishFrame(Date.now(), cursor);
    const practising = inPractice();
    const shown = this.motion.update(practising || this.paused ? null : cursor, frame.t);
    if (shown.position && !practising && !this.paused) {
      if (!this.cursorShown) this.cursorShown = this.options.native.showCursor();
      const look = shown.look === 'lost' ? 'lost' : snapshot.pinching ? 'press' : snapshot.holding ? 'drag' : 'hover';
      this.options.native.moveCursor(shown.position.x, shown.position.y, look);
    } else {
      this.hideCursor();
    }

    for (const event of events) {
      publishGesture({ event, cursor });
      if (practising || frame.synthetic) continue;
      const key = gestureKey(event);
      // The end of a hold always goes through, so nothing stays pressed.
      if (event.phase !== 'end') {
        // Only a steady hand in enough light acts, at a human pace.
        if (dark || !steady) continue;
        if (!isAdjustment(key) && !this.guard.allow(key, frame.t)) continue;
      }
      this.act(event, cursor);
    }
    return events;
  }

  private act(event: GestureEvent, cursor: Vec2 | null): void {
    const key = gestureKey(event);
    const binding = this.options.profiles.resolve(this.options.foreground(), key);
    if (this.paused && binding?.action.type !== 'pause') return;
    if ((event.kind === 'pinch' || event.kind === 'fist') && this.options.voiceGesture?.(event.kind)) return;
    if (!binding) return;
    void dispatchProfileAction(binding.action, this.options.native, { cursor, screen: this.screen, profiles: this.options.profiles }, this.options.ui);
  }

  private hideCursor(): void {
    if (!this.cursorShown) return;
    this.cursorShown = false;
    this.options.native.hideCursor();
  }
}
