import type { Vec2 } from './landmarks';

/** Discrete gestures the classifier can emit. */
export type GestureKind =
  | 'open_palm'
  | 'point'
  | 'pinch'
  | 'double_pinch'
  | 'pinch_hold'
  | 'fist'
  | 'swipe_two'
  | 'swipe_three'
  | 'circle_cw'
  | 'circle_ccw'
  | 'flick';

export type Direction = 'left' | 'right' | 'up' | 'down';

export const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down'];

export interface GestureEvent {
  kind: GestureKind;
  /** Timestamp of the frame that completed the gesture, in milliseconds. */
  t: number;
  /** Set for swipes and flicks. Directions are in screen space as the user sees it. */
  direction?: Direction;
  /** Set for pinch_hold: start when the hold is recognized, end when the fingers open. */
  phase?: 'start' | 'end';
  /** Normalized camera position where the gesture happened (pinch point, fingertip or palm). */
  position: Vec2;
  /** Heuristic confidence from 0 to 1. */
  confidence: number;
}

/**
 * Keys used by app profiles to bind gestures to actions. Directional gestures
 * have one key per direction.
 */
export const GESTURE_KEYS = [
  'open_palm',
  'point',
  'pinch',
  'double_pinch',
  'pinch_hold',
  'fist',
  'swipe_two_left',
  'swipe_two_right',
  'swipe_two_up',
  'swipe_two_down',
  'swipe_three_left',
  'swipe_three_right',
  'swipe_three_up',
  'swipe_three_down',
  'circle_cw',
  'circle_ccw',
  'flick_left',
  'flick_right',
  'flick_up',
  'flick_down',
] as const;

export type GestureKey = (typeof GESTURE_KEYS)[number];

export function isGestureKey(value: string): value is GestureKey {
  return (GESTURE_KEYS as readonly string[]).includes(value);
}

export function gestureKey(event: Pick<GestureEvent, 'kind' | 'direction'>): GestureKey {
  'worklet';
  if (event.kind === 'swipe_two' || event.kind === 'swipe_three' || event.kind === 'flick') {
    return `${event.kind}_${event.direction ?? 'up'}` as GestureKey;
  }
  return event.kind as GestureKey;
}

const BASE_LABELS: Record<string, string> = {
  open_palm: 'Open palm',
  point: 'Point',
  pinch: 'Pinch',
  double_pinch: 'Double pinch',
  pinch_hold: 'Pinch and hold',
  fist: 'Fist',
  swipe_two: 'Two finger swipe',
  swipe_three: 'Three finger swipe',
  circle_cw: 'Circle clockwise',
  circle_ccw: 'Circle counterclockwise',
  flick: 'Flick',
};

/** Human readable label, for example "Two finger swipe left". */
export function describeGesture(key: GestureKey): string {
  for (const prefix of ['swipe_two', 'swipe_three', 'flick']) {
    if (key.startsWith(`${prefix}_`)) {
      return `${BASE_LABELS[prefix]} ${key.slice(prefix.length + 1)}`;
    }
  }
  return BASE_LABELS[key] ?? key;
}
