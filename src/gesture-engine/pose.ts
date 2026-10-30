import type { HandFeatures } from './features';

/** Static hand shapes recognized frame by frame. */
export type HandPose =
  | 'none'
  | 'unknown'
  | 'open_palm'
  | 'point'
  | 'pinch'
  | 'fist'
  | 'two_fingers'
  | 'three_fingers';

export interface PinchThresholds {
  /** Pinch starts when the thumb to index distance drops below this, in palm sizes. */
  enter: number;
  /** Pinch ends when the distance grows above this, in palm sizes. */
  release: number;
  /** A curled index with the thumb resting on it is a fist, not a pinch. */
  maxIndexBend: number;
}

export const DEFAULT_PINCH_THRESHOLDS: PinchThresholds = {
  enter: 0.25,
  release: 0.38,
  maxIndexBend: 2.6,
};

/**
 * Classifies the hand shape of one frame. wasPinching applies hysteresis so a
 * pinch does not flicker at the threshold.
 */
export function classifyPose(features: HandFeatures, wasPinching: boolean, pinch: PinchThresholds): HandPose {
  'worklet';
  const limit = wasPinching ? pinch.release : pinch.enter;
  if (features.pinchDistance < limit && features.bend.index < pinch.maxIndexBend) {
    return 'pinch';
  }
  const f = features.fingers;
  const index = f.index === 'extended';
  const middle = f.middle === 'extended';
  const ring = f.ring === 'extended';
  const pinky = f.pinky === 'extended';

  if (index && middle && ring && pinky) {
    return 'open_palm';
  }
  if (!index && !middle && !ring && !pinky) {
    // A half bent index with folded fingers is the shape of a pinch in progress, not a fist.
    // A thumbs up is not a fist either: real photos showed it, and a fist starts listening.
    const fist = f.index === 'curled' && f.middle === 'curled' && (f.ring === 'curled' || f.pinky === 'curled') && f.thumb !== 'extended';
    return fist ? 'fist' : 'unknown';
  }
  if (index && !middle && !ring && !pinky) {
    return 'point';
  }
  if (index && middle && !ring && !pinky) {
    return 'two_fingers';
  }
  if (index && middle && ring && !pinky) {
    return 'three_fingers';
  }
  return 'unknown';
}

export interface PoseStabilizerConfig {
  /** Frames a new pose must be observed before it becomes current. */
  minFrames: number;
  /** Time a new pose must be observed before it becomes current, in milliseconds. */
  minMs: number;
}

export const DEFAULT_POSE_STABILIZER: PoseStabilizerConfig = { minFrames: 2, minMs: 30 };

export interface PoseTrackerState {
  current: HandPose;
  /** When the current pose was first observed. */
  currentSince: number;
  candidate: HandPose;
  candidateSince: number;
  candidateFrames: number;
}

export function createPoseTracker(): PoseTrackerState {
  'worklet';
  return { current: 'none', currentSince: 0, candidate: 'none', candidateSince: 0, candidateFrames: 0 };
}

/** Feeds one observed pose. Returns true when the current pose changed. */
export function updatePose(
  state: PoseTrackerState,
  observed: HandPose,
  t: number,
  config: PoseStabilizerConfig,
): boolean {
  'worklet';
  if (observed === state.current) {
    state.candidate = observed;
    state.candidateFrames = 0;
    return false;
  }
  if (observed === 'none') {
    state.current = 'none';
    state.currentSince = t;
    state.candidate = 'none';
    state.candidateFrames = 0;
    return true;
  }
  if (observed !== state.candidate || state.candidateFrames === 0) {
    state.candidate = observed;
    state.candidateSince = t;
    state.candidateFrames = 1;
  } else {
    state.candidateFrames++;
  }
  if (state.candidateFrames >= config.minFrames && t - state.candidateSince >= config.minMs) {
    state.current = state.candidate;
    state.currentSince = state.candidateSince;
    state.candidateFrames = 0;
    return true;
  }
  return false;
}
