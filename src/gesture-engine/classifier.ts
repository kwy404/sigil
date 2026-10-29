import {
  computeFeatures,
  DEFAULT_FEATURE_THRESHOLDS,
  toIsotropic,
  type FeatureThresholds,
  type FingerStates,
} from './features';
import { distance3 } from './geometry';
import type { GestureEvent, GestureKind } from './gestures';
import { HandPoint, isValidLandmarks, type HandFrame, type Landmark, type Vec2 } from './landmarks';
import {
  DEFAULT_CIRCLE,
  DEFAULT_FLICK,
  DEFAULT_SWIPE,
  detectCircle,
  detectFlick,
  detectSwipe,
  pushTrackPoint,
  type CircleConfig,
  type FlickConfig,
  type SwipeConfig,
  type TrackPoint,
} from './motion';
import {
  createLandmarkFilterState,
  DEFAULT_ONE_EURO,
  filterLandmarks,
  resetLandmarkFilter,
  type LandmarkFilterState,
  type OneEuroParams,
} from './one-euro';
import {
  classifyPose,
  createPoseTracker,
  DEFAULT_PINCH_THRESHOLDS,
  DEFAULT_POSE_STABILIZER,
  updatePose,
  type HandPose,
  type PinchThresholds,
  type PoseStabilizerConfig,
  type PoseTrackerState,
} from './pose';

export interface PinchTiming {
  /** Shortest pinch that counts, in milliseconds. */
  minMs: number;
  /** A pinch held this long becomes pinch_hold. */
  holdMs: number;
  /** A second pinch that starts within this time after the first one ends is a double pinch. */
  doubleWindowMs: number;
  /** Wait for the double pinch window before emitting a single pinch. */
  deferSingle: boolean;
}

export interface PoseHoldTiming {
  openPalmMs: number;
  fistMs: number;
  pointMs: number;
}

export interface ClassifierConfig {
  /** Camera frame width divided by height. */
  frameAspect: number;
  /** One Euro parameters, or null to classify raw landmarks. */
  smoothing: OneEuroParams | null;
  features: FeatureThresholds;
  pinchThresholds: PinchThresholds;
  stabilizer: PoseStabilizerConfig;
  pinch: PinchTiming;
  holds: PoseHoldTiming;
  swipe: SwipeConfig;
  circle: CircleConfig;
  flick: FlickConfig;
  /** Pause after a motion gesture before the next one can fire, in milliseconds. */
  cooldownMs: number;
  /** Longest motion history kept, in milliseconds. */
  historyMs: number;
}

export const DEFAULT_CLASSIFIER_CONFIG: ClassifierConfig = {
  frameAspect: 1,
  smoothing: DEFAULT_ONE_EURO,
  features: DEFAULT_FEATURE_THRESHOLDS,
  pinchThresholds: DEFAULT_PINCH_THRESHOLDS,
  stabilizer: DEFAULT_POSE_STABILIZER,
  pinch: { minMs: 40, holdMs: 550, doubleWindowMs: 350, deferSingle: true },
  holds: { openPalmMs: 300, fistMs: 300, pointMs: 150 },
  swipe: DEFAULT_SWIPE,
  circle: DEFAULT_CIRCLE,
  flick: DEFAULT_FLICK,
  cooldownMs: 450,
  historyMs: 1800,
};

export interface ClassifierOverrides {
  frameAspect?: number;
  smoothing?: Partial<OneEuroParams> | null;
  features?: Partial<FeatureThresholds>;
  pinchThresholds?: Partial<PinchThresholds>;
  stabilizer?: Partial<PoseStabilizerConfig>;
  pinch?: Partial<PinchTiming>;
  holds?: Partial<PoseHoldTiming>;
  swipe?: Partial<SwipeConfig>;
  circle?: Partial<CircleConfig>;
  flick?: Partial<FlickConfig>;
  cooldownMs?: number;
  historyMs?: number;
}

export function resolveClassifierConfig(overrides: ClassifierOverrides = {}): ClassifierConfig {
  'worklet';
  const d = DEFAULT_CLASSIFIER_CONFIG;
  return {
    frameAspect: overrides.frameAspect ?? d.frameAspect,
    smoothing: overrides.smoothing === null ? null : { ...DEFAULT_ONE_EURO, ...overrides.smoothing },
    features: { ...d.features, ...overrides.features },
    pinchThresholds: { ...d.pinchThresholds, ...overrides.pinchThresholds },
    stabilizer: { ...d.stabilizer, ...overrides.stabilizer },
    pinch: { ...d.pinch, ...overrides.pinch },
    holds: { ...d.holds, ...overrides.holds },
    swipe: { ...d.swipe, ...overrides.swipe },
    circle: { ...d.circle, ...overrides.circle },
    flick: { ...d.flick, ...overrides.flick },
    cooldownMs: overrides.cooldownMs ?? d.cooldownMs,
    historyMs: overrides.historyMs ?? d.historyMs,
  };
}

/** Plain data state so the classifier can live inside a worklet runtime. */
export interface ClassifierState {
  config: ClassifierConfig;
  filter: LandmarkFilterState;
  pose: PoseTrackerState;
  lastObserved: HandPose;
  /** Finger states of the previous frame, used for hysteresis. */
  fingers: FingerStates | null;
  poseEventSent: boolean;
  /**
   * True after the point event fired, until the hand shows a shape that is not
   * part of cursor control. Pinching and returning to point keeps the session.
   */
  cursorSession: boolean;
  handVisible: boolean;
  lastT: number;
  /** Normalized cursor position, or null when no hand is visible. */
  cursor: Vec2 | null;
  pinchActive: boolean;
  pinchStart: number;
  pinchPosition: Vec2;
  holdSent: boolean;
  /** Release time of a single pinch waiting for the double pinch window, or -1. */
  pendingTapT: number;
  pendingTapPosition: Vec2;
  palmTrack: TrackPoint[];
  tipTrack: TrackPoint[];
  cooldownUntil: number;
}

export interface ClassifierSnapshot {
  pose: HandPose;
  handVisible: boolean;
  cursor: Vec2 | null;
  pinching: boolean;
  holding: boolean;
}

export function createClassifierState(overrides: ClassifierOverrides = {}): ClassifierState {
  'worklet';
  return {
    config: resolveClassifierConfig(overrides),
    filter: createLandmarkFilterState(),
    pose: createPoseTracker(),
    lastObserved: 'none',
    fingers: null,
    poseEventSent: false,
    cursorSession: false,
    handVisible: false,
    lastT: -Infinity,
    cursor: null,
    pinchActive: false,
    pinchStart: 0,
    pinchPosition: { x: 0, y: 0 },
    holdSent: false,
    pendingTapT: -1,
    pendingTapPosition: { x: 0, y: 0 },
    palmTrack: [],
    tipTrack: [],
    cooldownUntil: -Infinity,
  };
}

function makeEvent(kind: GestureKind, t: number, position: Vec2, confidence: number): GestureEvent {
  'worklet';
  return { kind, t, position: { x: position.x, y: position.y }, confidence };
}

function emitPendingTap(state: ClassifierState, t: number, events: GestureEvent[], force: boolean): void {
  'worklet';
  if (state.pendingTapT < 0 || (state.pinchActive && !force)) {
    return;
  }
  const expired = t - state.pendingTapT > state.config.pinch.doubleWindowMs;
  const secondStarting = state.pose.candidate === 'pinch' && state.pose.candidateFrames > 0;
  if (force || (expired && !secondStarting)) {
    events.push(makeEvent('pinch', t, state.pendingTapPosition, 0.9));
    state.pendingTapT = -1;
  }
}

function releasePinch(state: ClassifierState, releaseT: number, position: Vec2, events: GestureEvent[]): void {
  'worklet';
  const timing = state.config.pinch;
  state.pinchActive = false;
  if (state.holdSent) {
    state.holdSent = false;
    const end = makeEvent('pinch_hold', releaseT, position, 0.9);
    end.phase = 'end';
    events.push(end);
    return;
  }
  if (releaseT - state.pinchStart < timing.minMs) {
    return;
  }
  if (state.pendingTapT >= 0) {
    state.pendingTapT = -1;
    events.push(makeEvent('double_pinch', releaseT, state.pendingTapPosition, 0.9));
    return;
  }
  if (timing.deferSingle) {
    state.pendingTapT = releaseT;
    state.pendingTapPosition = { x: state.pinchPosition.x, y: state.pinchPosition.y };
    return;
  }
  events.push(makeEvent('pinch', releaseT, state.pinchPosition, 0.9));
}

function clearMotion(state: ClassifierState): void {
  'worklet';
  state.palmTrack.length = 0;
  state.tipTrack.length = 0;
}

function handleHandLost(state: ClassifierState, t: number, events: GestureEvent[]): void {
  'worklet';
  if (state.pinchActive) {
    releasePinch(state, t, state.cursor ?? state.pinchPosition, events);
  }
  if (state.handVisible || state.pose.current !== 'none') {
    updatePose(state.pose, 'none', t, state.config.stabilizer);
  }
  state.handVisible = false;
  state.lastObserved = 'none';
  state.fingers = null;
  state.poseEventSent = false;
  state.cursorSession = false;
  state.cursor = null;
  clearMotion(state);
  resetLandmarkFilter(state.filter);
}

function keepsCursorSession(pose: HandPose): boolean {
  'worklet';
  return pose === 'point' || pose === 'pinch' || pose === 'unknown';
}

function staticHoldMs(pose: HandPose, holds: PoseHoldTiming): number {
  'worklet';
  if (pose === 'open_palm') return holds.openPalmMs;
  if (pose === 'fist') return holds.fistMs;
  if (pose === 'point') return holds.pointMs;
  return -1;
}

/**
 * Feeds one frame and returns the gestures it completed. Frames must arrive in
 * time order; older frames are ignored.
 */
export function stepClassifier(state: ClassifierState, frame: HandFrame): GestureEvent[] {
  'worklet';
  const events: GestureEvent[] = [];
  const config = state.config;
  const t = frame.t;
  if (t < state.lastT) {
    return events;
  }
  state.lastT = t;

  emitPendingTap(state, t, events, false);

  if (!isValidLandmarks(frame.landmarks)) {
    handleHandLost(state, t, events);
    return events;
  }

  const smooth: readonly Landmark[] = config.smoothing
    ? filterLandmarks(state.filter, frame.landmarks, t, config.smoothing)
    : frame.landmarks;
  const iso = toIsotropic(smooth, config.frameAspect);
  const features = computeFeatures(iso, config.features, state.fingers);
  state.fingers = features.fingers;
  if (smooth !== frame.landmarks) {
    // Smoothing lags behind a fast pinch, so the pinch distance uses the raw
    // landmarks. The hysteresis between enter and release absorbs their noise.
    const thumb = frame.landmarks[HandPoint.ThumbTip];
    const index = frame.landmarks[HandPoint.IndexTip];
    const a = config.frameAspect;
    features.pinchDistance =
      distance3({ x: thumb.x, y: thumb.y / a, z: thumb.z }, { x: index.x, y: index.y / a, z: index.z }) / features.palmSize;
  }
  const observed = classifyPose(features, state.lastObserved === 'pinch', config.pinchThresholds);
  state.lastObserved = observed;
  state.handVisible = true;

  if (updatePose(state.pose, observed, t, config.stabilizer)) {
    state.poseEventSent = false;
    if (!keepsCursorSession(state.pose.current)) {
      state.cursorSession = false;
    }
  }
  const current = state.pose.current;

  const thumbTip = smooth[HandPoint.ThumbTip];
  const indexTip = smooth[HandPoint.IndexTip];
  const tip: Vec2 = { x: indexTip.x, y: indexTip.y };
  const pinchPoint: Vec2 = { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 };
  const palm: Vec2 = { x: features.palmCenter.x, y: features.palmCenter.y * config.frameAspect };

  if (current === 'pinch' && !state.pinchActive) {
    if (state.pendingTapT >= 0 && state.pose.currentSince - state.pendingTapT > config.pinch.doubleWindowMs) {
      // The second pinch started too late to be a double pinch.
      emitPendingTap(state, t, events, true);
    }
    state.pinchActive = true;
    state.pinchStart = state.pose.currentSince;
    state.pinchPosition = pinchPoint;
    state.holdSent = false;
  } else if (state.pinchActive && current === 'pinch') {
    if (!state.holdSent && t - state.pinchStart >= config.pinch.holdMs) {
      emitPendingTap(state, t, events, true);
      state.holdSent = true;
      const start = makeEvent('pinch_hold', t, state.pinchPosition, 0.9);
      start.phase = 'start';
      events.push(start);
    }
  } else if (state.pinchActive) {
    releasePinch(state, state.pose.currentSince, pinchPoint, events);
  }

  if (!state.poseEventSent) {
    const hold = staticHoldMs(current, config.holds);
    if (current === 'point' && state.cursorSession) {
      state.poseEventSent = true;
    } else if (hold >= 0 && t - state.pose.currentSince >= hold) {
      state.poseEventSent = true;
      if (current === 'point') {
        state.cursorSession = true;
      }
      events.push(makeEvent(current as GestureKind, t, current === 'point' ? tip : palm, 0.85));
    }
  }

  pushTrackPoint(state.palmTrack, { t, x: features.palmCenter.x, y: features.palmCenter.y, pose: observed }, config.historyMs);
  pushTrackPoint(state.tipTrack, { t, x: features.indexTip.x, y: features.indexTip.y, pose: observed }, config.historyMs);

  if (t >= state.cooldownUntil && !state.pinchActive) {
    let motion: GestureEvent | null = null;
    const two = detectSwipe(state.palmTrack, t, 'two_fingers', config.swipe);
    const three = two === null ? detectSwipe(state.palmTrack, t, 'three_fingers', config.swipe) : null;
    const swipe = two ?? three;
    if (swipe !== null) {
      motion = makeEvent(two !== null ? 'swipe_two' : 'swipe_three', t, palm, Math.min(1, swipe.distance / (config.swipe.minDistance * 2)));
      motion.direction = swipe.direction;
    } else {
      const circle = detectCircle(state.tipTrack, t, config.circle);
      if (circle !== null) {
        motion = makeEvent(circle.clockwise ? 'circle_cw' : 'circle_ccw', t, tip, Math.min(1, circle.turns));
      } else {
        const flick = detectFlick(state.tipTrack, t, config.flick);
        if (flick !== null) {
          motion = makeEvent('flick', t, tip, Math.min(1, flick.peakSpeed / (config.flick.minPeakSpeed * 2)));
          motion.direction = flick.direction;
        }
      }
    }
    if (motion !== null) {
      events.push(motion);
      state.cooldownUntil = t + config.cooldownMs;
      clearMotion(state);
    }
  }

  if (state.pinchActive && !state.holdSent) {
    state.cursor = state.pinchPosition;
  } else {
    state.cursor = current === 'pinch' ? pinchPoint : tip;
  }
  return events;
}

/**
 * Emits a pending single pinch once its double pinch window is over. Call it
 * from a timer when frames stop arriving, or with force at the end of a
 * recording.
 */
export function flushClassifier(state: ClassifierState, t: number, force = false): GestureEvent[] {
  'worklet';
  const events: GestureEvent[] = [];
  emitPendingTap(state, t, events, force);
  return events;
}

export function snapshotClassifier(state: ClassifierState): ClassifierSnapshot {
  'worklet';
  return {
    pose: state.pose.current,
    handVisible: state.handVisible,
    cursor: state.cursor === null ? null : { x: state.cursor.x, y: state.cursor.y },
    pinching: state.pinchActive,
    holding: state.holdSent,
  };
}

/** Object oriented wrapper for use on the JavaScript thread. */
export class GestureClassifier {
  private state: ClassifierState;

  constructor(private readonly overrides: ClassifierOverrides = {}) {
    this.state = createClassifierState(overrides);
  }

  get config(): ClassifierConfig {
    return this.state.config;
  }

  get snapshot(): ClassifierSnapshot {
    return snapshotClassifier(this.state);
  }

  push(frame: HandFrame): GestureEvent[] {
    return stepClassifier(this.state, frame);
  }

  flush(t: number, force = false): GestureEvent[] {
    return flushClassifier(this.state, t, force);
  }

  reset(): void {
    this.state = createClassifierState(this.overrides);
  }
}
