import { GestureClassifier, type ClassifierOverrides } from './classifier';
import { gestureKey, type GestureEvent, type GestureKey } from './gestures';
import type { Vec2 } from './landmarks';
import type { HandPose } from './pose';
import type { HandRecording } from './samples';

export interface ReplayResult {
  recordingId: string;
  events: GestureEvent[];
  /** Keys of the recognized gestures, without pinch_hold end events. */
  keys: GestureKey[];
  expected: GestureKey[];
  passed: boolean;
  durationMs: number;
  frameCount: number;
}

/** Runs the classifier over a recording, as if the frames arrived live. */
export function replayRecording(recording: HandRecording, overrides: ClassifierOverrides = {}): ReplayResult {
  const classifier = new GestureClassifier({ frameAspect: recording.frameAspect, ...overrides });
  const events: GestureEvent[] = [];
  for (const frame of recording.frames) {
    events.push(...classifier.push(frame));
  }
  const last = recording.frames.length > 0 ? recording.frames[recording.frames.length - 1].t : 0;
  events.push(...classifier.flush(last, true));
  const keys = events.filter((e) => e.phase !== 'end').map((e) => gestureKey(e));
  const first = recording.frames.length > 0 ? recording.frames[0].t : 0;
  return {
    recordingId: recording.id,
    events,
    keys,
    expected: recording.expected,
    passed: keys.length === recording.expected.length && keys.every((k, i) => k === recording.expected[i]),
    durationMs: last - first,
    frameCount: recording.frames.length,
  };
}

export interface TracePoint {
  t: number;
  /** Filtered cursor in normalized camera coordinates, null without a hand. */
  cursor: Vec2 | null;
  pose: HandPose;
  pinching: boolean;
  holding: boolean;
}

export interface RecordingTrace {
  points: TracePoint[];
  events: GestureEvent[];
}

/** Replays a recording and keeps the classifier snapshot of every frame, for drawing the cursor path. */
export function traceRecording(recording: HandRecording, overrides: ClassifierOverrides = {}): RecordingTrace {
  const classifier = new GestureClassifier({ frameAspect: recording.frameAspect, ...overrides });
  const points: TracePoint[] = [];
  const events: GestureEvent[] = [];
  for (const frame of recording.frames) {
    events.push(...classifier.push(frame));
    const snapshot = classifier.snapshot;
    points.push({
      t: frame.t,
      cursor: snapshot.cursor,
      pose: snapshot.pose,
      pinching: snapshot.pinching,
      holding: snapshot.holding,
    });
  }
  const last = recording.frames.length > 0 ? recording.frames[recording.frames.length - 1].t : 0;
  events.push(...classifier.flush(last, true));
  return { points, events };
}
