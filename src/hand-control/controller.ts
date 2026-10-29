import type { ProfileRegistry } from '../app-profiles/registry';
import { DEFAULT_CONTROL_BOX, mapToScreen, type ControlBox, type ScreenSize } from '../gesture-engine/mapping';
import { GestureClassifier } from '../gesture-engine/classifier';
import { gestureKey, type GestureEvent } from '../gesture-engine/gestures';
import { unflattenLandmarks, type HandFrame, type Vec2 } from '../gesture-engine/landmarks';
import { dispatchProfileAction, type GestureTarget, type SigilUi } from '../system-control/dispatch';
import { inPractice, publishFrame, publishGesture } from './feed';

/** What the hand control needs from the native module; NativeControl satisfies it, tests use a fake. */
export interface HandControlNative extends GestureTarget {
  moveCursor(x: number, y: number, state: 'idle' | 'hover' | 'press' | 'drag'): void;
  hideCursor(): void;
  showCursor(): boolean;
}

/** One tracker result as the native module emits it. */
export interface NativeHandFrame {
  t: number;
  landmarks: number[];
  score: number;
  handedness: 'left' | 'right' | null;
  /** Frames of the demo hand: they move the cursor and reach practice screens, but never act on apps. */
  synthetic?: boolean;
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
}

/**
 * Live hand control: each camera frame goes through the gesture classifier,
 * the cursor follows the filtered fingertip, and each gesture does what the
 * profile of the app in front binds it to, so a pinch really taps where the
 * cursor is. While a practice screen is open the gestures only go to it, and
 * while a voice question is open a pinch confirms and a fist cancels.
 */
export class HandControl {
  private readonly classifier = new GestureClassifier();
  private cursorShown = false;
  private paused = false;

  constructor(private readonly options: HandControlOptions) {}

  /** Pause or resume gesture actions. The pause gesture itself still works, so the user can resume. */
  togglePause(): void {
    this.paused = !this.paused;
    if (this.paused) this.hideCursor();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Handles one frame and returns the gestures it completed. */
  push(frame: NativeHandFrame): GestureEvent[] {
    const landmarks = frame.landmarks.length > 0 ? unflattenLandmarks(frame.landmarks) : null;
    const input: HandFrame = { t: frame.t, landmarks, score: frame.score, handedness: frame.handedness ?? undefined };
    const events = this.classifier.push(input);
    const snapshot = this.classifier.snapshot;
    const box = this.options.box ?? DEFAULT_CONTROL_BOX;
    const cursor: Vec2 | null = snapshot.cursor ? mapToScreen(snapshot.cursor, box, this.options.screen) : null;
    publishFrame(Date.now(), cursor);
    const practising = inPractice();
    if (!practising && !this.paused && cursor) {
      if (!this.cursorShown) this.cursorShown = this.options.native.showCursor();
      this.options.native.moveCursor(cursor.x, cursor.y, snapshot.pinching ? 'press' : snapshot.holding ? 'drag' : 'hover');
    } else if (!cursor || practising) {
      this.hideCursor();
    }
    for (const event of events) {
      publishGesture({ event, cursor });
      if (practising || frame.synthetic) continue;
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
    void dispatchProfileAction(binding.action, this.options.native, { cursor, screen: this.options.screen, profiles: this.options.profiles }, this.options.ui);
  }

  private hideCursor(): void {
    if (!this.cursorShown) return;
    this.cursorShown = false;
    this.options.native.hideCursor();
  }
}
