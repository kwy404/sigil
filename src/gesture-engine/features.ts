import { bendAngle, distance3 } from './geometry';
import { FINGER_CHAINS, HandPoint, type FingerName, type Landmark, type Vec2 } from './landmarks';

export type FingerState = 'extended' | 'curled' | 'partial';

export interface FeatureThresholds {
  /** A finger whose total bend is below this angle (radians) is extended. */
  extendedMaxBend: number;
  /** A finger whose total bend is above this angle (radians) is curled. */
  curledMinBend: number;
  /** Thumb tip to index base distance, in palm sizes, above which the thumb is extended. */
  thumbExtendedReach: number;
  /** Thumb tip to index base distance, in palm sizes, below which the thumb is curled. */
  thumbCurledReach: number;
  /** Extra bend, in radians, a finger may gain or lose before it leaves its previous state. */
  bendHysteresis: number;
  /** Extra reach, in palm sizes, the thumb may gain or lose before it leaves its previous state. */
  reachHysteresis: number;
}

export const DEFAULT_FEATURE_THRESHOLDS: FeatureThresholds = {
  extendedMaxBend: 1.0,
  curledMinBend: 1.9,
  thumbExtendedReach: 0.5,
  thumbCurledReach: 0.3,
  bendHysteresis: 0.35,
  reachHysteresis: 0.08,
};

export interface FingerStates {
  thumb: FingerState;
  index: FingerState;
  middle: FingerState;
  ring: FingerState;
  pinky: FingerState;
}

export interface FingerBends {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

export interface HandFeatures {
  /** Wrist to middle finger base distance, the unit for every relative measure. */
  palmSize: number;
  /** Total flexion of each finger in radians. */
  bend: FingerBends;
  fingers: FingerStates;
  /** Thumb tip to index tip distance in palm sizes. */
  pinchDistance: number;
  /** Thumb tip to index base distance in palm sizes. */
  thumbReach: number;
  palmCenter: Vec2;
  indexTip: Vec2;
  /** Midpoint between the thumb tip and the index tip. */
  pinchPoint: Vec2;
}

/**
 * Converts normalized frame coordinates to isotropic coordinates where one
 * unit is the frame width on both axes. aspect is width divided by height.
 */
export function toIsotropic(landmarks: readonly Landmark[], aspect: number): Landmark[] {
  'worklet';
  const out: Landmark[] = [];
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    out.push({ x: p.x, y: p.y / aspect, z: p.z });
  }
  return out;
}

/** Sum of the flexion angles of the three joints of a finger, in radians. */
export function fingerBend(landmarks: readonly Landmark[], finger: FingerName): number {
  'worklet';
  const chain = FINGER_CHAINS[finger];
  const base = landmarks[chain[0]];
  const j1 = landmarks[chain[1]];
  const j2 = landmarks[chain[2]];
  const tip = landmarks[chain[3]];
  // The thumb base joint moves with the palm, so only its two outer joints count.
  const baseBend = finger === 'thumb' ? 0 : bendAngle(landmarks[HandPoint.Wrist], base, j1);
  return baseBend + bendAngle(base, j1, j2) + bendAngle(j1, j2, tip);
}

function stateFromBend(bend: number, thresholds: FeatureThresholds, previous: FingerState | null): FingerState {
  'worklet';
  const extendedLimit = thresholds.extendedMaxBend + (previous === 'extended' ? thresholds.bendHysteresis : 0);
  const curledLimit = thresholds.curledMinBend - (previous === 'curled' ? thresholds.bendHysteresis : 0);
  if (bend <= extendedLimit) {
    return 'extended';
  }
  if (bend >= curledLimit) {
    return 'curled';
  }
  return 'partial';
}

function thumbStateFromReach(reach: number, thresholds: FeatureThresholds, previous: FingerState | null): FingerState {
  'worklet';
  const extendedLimit = thresholds.thumbExtendedReach - (previous === 'extended' ? thresholds.reachHysteresis : 0);
  const curledLimit = thresholds.thumbCurledReach + (previous === 'curled' ? thresholds.reachHysteresis : 0);
  if (reach >= extendedLimit) {
    return 'extended';
  }
  if (reach <= curledLimit) {
    return 'curled';
  }
  return 'partial';
}

/**
 * Computes the per frame features used by the pose classifier.
 * landmarks must be isotropic (see toIsotropic). previous holds the finger
 * states of the last frame, which adds hysteresis so noise near a threshold
 * does not make a finger flicker between states.
 */
export function computeFeatures(
  landmarks: readonly Landmark[],
  thresholds: FeatureThresholds,
  previous: FingerStates | null = null,
): HandFeatures {
  'worklet';
  const wrist = landmarks[HandPoint.Wrist];
  const palmSize = Math.max(distance3(wrist, landmarks[HandPoint.MiddleMcp]), 1e-6);
  const thumbTip = landmarks[HandPoint.ThumbTip];
  const indexTip = landmarks[HandPoint.IndexTip];
  const thumbReach = distance3(thumbTip, landmarks[HandPoint.IndexMcp]) / palmSize;

  const bend: FingerBends = {
    thumb: fingerBend(landmarks, 'thumb'),
    index: fingerBend(landmarks, 'index'),
    middle: fingerBend(landmarks, 'middle'),
    ring: fingerBend(landmarks, 'ring'),
    pinky: fingerBend(landmarks, 'pinky'),
  };

  const fingers: FingerStates = {
    thumb: thumbStateFromReach(thumbReach, thresholds, previous ? previous.thumb : null),
    index: stateFromBend(bend.index, thresholds, previous ? previous.index : null),
    middle: stateFromBend(bend.middle, thresholds, previous ? previous.middle : null),
    ring: stateFromBend(bend.ring, thresholds, previous ? previous.ring : null),
    pinky: stateFromBend(bend.pinky, thresholds, previous ? previous.pinky : null),
  };

  const palmPoints = [
    HandPoint.Wrist,
    HandPoint.IndexMcp,
    HandPoint.MiddleMcp,
    HandPoint.RingMcp,
    HandPoint.PinkyMcp,
  ];
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < palmPoints.length; i++) {
    cx += landmarks[palmPoints[i]].x;
    cy += landmarks[palmPoints[i]].y;
  }

  return {
    palmSize,
    bend,
    fingers,
    pinchDistance: distance3(thumbTip, indexTip) / palmSize,
    thumbReach,
    palmCenter: { x: cx / palmPoints.length, y: cy / palmPoints.length },
    indexTip: { x: indexTip.x, y: indexTip.y },
    pinchPoint: { x: (thumbTip.x + indexTip.x) / 2, y: (thumbTip.y + indexTip.y) / 2 },
  };
}
