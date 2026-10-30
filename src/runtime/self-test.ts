import { gestureKey, type GestureEvent, type HandPose } from '../gesture-engine';
import type { Vec2 } from '../gesture-engine/landmarks';

/** What the native tracker found in one test photo. */
export interface TrackerPhoto {
  name: string;
  results: number;
  hands: number;
  landmarks: number;
  handedness: string | null;
  score: number;
}

/** The native half of the self test: MediaPipe on MediaPipe's own test photos. */
export interface TrackerSelfTest {
  passed: boolean;
  /** Native cursor overlay updates per second while the pointing hand slides. */
  cursorFps?: number;
  /** Delay from frame to cursor, smoothed, in milliseconds. */
  endToEndMs?: number;
  inferenceMs?: number;
  deliveryMs?: number;
  delegate?: string;
  photos?: TrackerPhoto[];
  landmarks?: number;
  handsFound?: number;
  results?: number;
  modelLoadMs?: number;
  totalMs?: number;
  error?: string | null;
}

/** What the gesture engine and the cursor did with one photo's frames. */
export interface PhotoTrace {
  frames: number;
  handFrames: number;
  /** How many hand frames the classifier gave each pose. */
  poses: Partial<Record<HandPose, number>>;
  gestures: string[];
  /** Cursor positions in screen pixels, in order. */
  cursor: Vec2[];
}

/** The pose each photo must produce, from the hand in it. Photos left out are only checked for a hand. */
export const EXPECTED_POSES: Readonly<Record<string, HandPose>> = {
  'pointing_up.jpg': 'point',
  'fist.jpg': 'fist',
  'victory.jpg': 'two_fingers',
  'right_hands.jpg': 'open_palm',
  'left_hands.jpg': 'open_palm',
};

/** Poses a photo must not produce: a thumbs up taken for a fist would start listening. */
export const FORBIDDEN_POSES: Readonly<Record<string, HandPose>> = {
  'thumb_up.jpg': 'fist',
};

/** The photo whose sliding must move the cursor: a pointing hand drives the cursor. */
export const MOVING_PHOTO = 'pointing_up.jpg';

/** The cursor must travel at least this share of the screen width while the pointing photo slides. */
export const MIN_CURSOR_TRAVEL = 0.12;

/** The native cursor must redraw at least this often while the hand moves, whatever the tracker rate. */
export const MIN_CURSOR_FPS = 30;

/** Frame to cursor delay that still feels direct on the slowest test machine. */
export const MAX_END_TO_END_MS = 500;

/** Collects, per photo, what the gesture engine made of the self test frames. */
export class SelfTestProbe {
  private readonly traces = new Map<string, PhotoTrace>();

  record(photo: string, pose: HandPose, handVisible: boolean, cursor: Vec2 | null, events: readonly GestureEvent[]): void {
    let trace = this.traces.get(photo);
    if (!trace) {
      trace = { frames: 0, handFrames: 0, poses: {}, gestures: [], cursor: [] };
      this.traces.set(photo, trace);
    }
    trace.frames++;
    if (handVisible) {
      trace.handFrames++;
      trace.poses[pose] = (trace.poses[pose] ?? 0) + 1;
    }
    if (cursor) trace.cursor.push({ x: cursor.x, y: cursor.y });
    for (const event of events) trace.gestures.push(gestureKey(event));
  }

  get result(): ReadonlyMap<string, PhotoTrace> {
    return this.traces;
  }
}

/** The pose the classifier gave most hand frames of a photo, ignoring unknown frames when another pose was seen. */
export function dominantPose(trace: PhotoTrace): HandPose | null {
  let best: HandPose | null = null;
  let count = 0;
  for (const [pose, n] of Object.entries(trace.poses) as [HandPose, number][]) {
    if (pose === 'none') continue;
    const weight = pose === 'unknown' ? n / 2 : n;
    if (weight > count) {
      best = pose;
      count = weight;
    }
  }
  return best;
}

export interface PhotoVerdict {
  name: string;
  hands: number;
  pose: HandPose | null;
  expected: HandPose | null;
  gestures: string[];
  /** Horizontal travel of the cursor over the photo's frames, in pixels. */
  travel: number;
  last: Vec2 | null;
  ok: boolean;
  problems: string[];
}

export interface SelfTestVerdict {
  passed: boolean;
  /** The cursor and stage timings the test measured. */
  timings?: { cursorFps: number; endToEndMs: number; inferenceMs: number; deliveryMs: number; delegate: string | null };
  tracker: boolean;
  photos: PhotoVerdict[];
  problems: string[];
  error: string | null;
}

/**
 * Judges the whole chain on the test photos: MediaPipe found a hand in every
 * photo, the classifier named the expected poses, the cursor followed the
 * sliding pointing hand, and it moved between photos.
 */
export function judgeSelfTest(tracker: TrackerSelfTest, traces: ReadonlyMap<string, PhotoTrace>, screenWidth: number): SelfTestVerdict {
  const problems: string[] = [];
  const photos: PhotoVerdict[] = (tracker.photos ?? []).map((photo) => {
    const trace = traces.get(photo.name) ?? { frames: 0, handFrames: 0, poses: {}, gestures: [], cursor: [] };
    const xs = trace.cursor.map((point) => point.x);
    const travel = xs.length > 1 ? Math.max(...xs) - Math.min(...xs) : 0;
    const pose = dominantPose(trace);
    const expected = EXPECTED_POSES[photo.name] ?? null;
    const own: string[] = [];
    if (photo.hands === 0 || photo.landmarks !== 21) own.push('no hand found');
    if (photo.hands > 0 && trace.handFrames === 0) own.push('no hand frame reached JavaScript');
    if (expected && pose !== expected) own.push(`pose ${pose ?? 'none'}, expected ${expected}`);
    if (FORBIDDEN_POSES[photo.name] && pose === FORBIDDEN_POSES[photo.name]) own.push(`pose ${pose}, which it must not be`);
    if (photo.name === MOVING_PHOTO && travel < screenWidth * MIN_CURSOR_TRAVEL) own.push(`cursor moved ${Math.round(travel)} px`);
    return {
      name: photo.name,
      hands: photo.hands,
      pose,
      expected,
      gestures: [...new Set(trace.gestures)],
      travel: Math.round(travel),
      last: trace.cursor.length > 0 ? trace.cursor[trace.cursor.length - 1] : null,
      ok: own.length === 0,
      problems: own,
    };
  });
  if (photos.length === 0) problems.push('no test photos ran');
  for (const photo of photos) for (const problem of photo.problems) problems.push(`${photo.name}: ${problem}`);
  // The cursor sits somewhere else after each photo with a hand.
  const placed = photos.filter((photo) => photo.last !== null);
  for (let i = 1; i < placed.length; i++) {
    const before = placed[i - 1].last as Vec2;
    const after = placed[i].last as Vec2;
    if (Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1) {
      problems.push(`the cursor did not move between ${placed[i - 1].name} and ${placed[i].name}`);
    }
  }
  if (!tracker.passed) problems.push(tracker.error ? `tracker: ${tracker.error}` : 'tracker: a photo without a hand');
  if (tracker.cursorFps !== undefined && tracker.cursorFps < MIN_CURSOR_FPS) problems.push(`cursor ${Math.round(tracker.cursorFps)} updates a second`);
  if (tracker.endToEndMs !== undefined && (tracker.endToEndMs <= 0 || tracker.endToEndMs > MAX_END_TO_END_MS)) {
    problems.push(`frame to cursor ${Math.round(tracker.endToEndMs)} ms`);
  }
  const timings = {
    cursorFps: Math.round(tracker.cursorFps ?? 0),
    endToEndMs: Math.round(tracker.endToEndMs ?? 0),
    inferenceMs: Math.round(tracker.inferenceMs ?? 0),
    deliveryMs: Math.round((tracker.deliveryMs ?? 0) * 10) / 10,
    delegate: tracker.delegate ?? null,
  };
  return { passed: problems.length === 0, tracker: tracker.passed, photos, problems, error: tracker.error ?? null, timings };
}
