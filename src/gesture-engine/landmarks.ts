/**
 * Hand landmark model shared by every hand tracker Sigil can use.
 *
 * The 21 points follow the MediaPipe Hand Landmarker layout, which is also the
 * layout of most open hand tracking models.
 */

export const HAND_LANDMARK_COUNT = 21;

export const HandPoint = {
  Wrist: 0,
  ThumbCmc: 1,
  ThumbMcp: 2,
  ThumbIp: 3,
  ThumbTip: 4,
  IndexMcp: 5,
  IndexPip: 6,
  IndexDip: 7,
  IndexTip: 8,
  MiddleMcp: 9,
  MiddlePip: 10,
  MiddleDip: 11,
  MiddleTip: 12,
  RingMcp: 13,
  RingPip: 14,
  RingDip: 15,
  RingTip: 16,
  PinkyMcp: 17,
  PinkyPip: 18,
  PinkyDip: 19,
  PinkyTip: 20,
} as const;

export type HandPointIndex = (typeof HandPoint)[keyof typeof HandPoint];

export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';

export const FINGERS: readonly FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];

/** Joint chain of each finger from its base joint to its tip. */
export const FINGER_CHAINS: Readonly<Record<FingerName, readonly [number, number, number, number]>> = {
  thumb: [1, 2, 3, 4],
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
};

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * One observation from the hand tracker.
 *
 * Coordinates are normalized to the camera frame as the user sees it, so the
 * front camera image must already be mirrored: x grows toward the right edge
 * of the screen, y grows downward, and z is relative depth in roughly the same
 * unit as x (negative values are closer to the camera).
 */
export interface HandFrame {
  /** Monotonic timestamp in milliseconds. */
  t: number;
  /** The 21 landmarks, or null when no hand is visible. */
  landmarks: readonly Landmark[] | null;
  /** Tracker confidence for this hand, from 0 to 1. */
  score?: number;
  handedness?: 'left' | 'right';
}

export function isValidLandmarks(landmarks: readonly Landmark[] | null | undefined): landmarks is readonly Landmark[] {
  'worklet';
  if (!landmarks || landmarks.length !== HAND_LANDMARK_COUNT) {
    return false;
  }
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return false;
    }
  }
  return true;
}

/** Packs landmarks as x, y, z triples, the format the native trackers emit. */
export function flattenLandmarks(landmarks: readonly Landmark[]): number[] {
  'worklet';
  const out: number[] = new Array(landmarks.length * 3);
  for (let i = 0; i < landmarks.length; i++) {
    out[i * 3] = landmarks[i].x;
    out[i * 3 + 1] = landmarks[i].y;
    out[i * 3 + 2] = landmarks[i].z;
  }
  return out;
}

/** Reverses flattenLandmarks. Returns null when the array has the wrong size. */
export function unflattenLandmarks(values: readonly number[]): Landmark[] | null {
  'worklet';
  if (values.length !== HAND_LANDMARK_COUNT * 3) {
    return null;
  }
  const out: Landmark[] = [];
  for (let i = 0; i < HAND_LANDMARK_COUNT; i++) {
    out.push({ x: values[i * 3], y: values[i * 3 + 1], z: values[i * 3 + 2] });
  }
  return out;
}
