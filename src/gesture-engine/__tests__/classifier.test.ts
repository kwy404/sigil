import { describe, expect, it } from '@jest/globals';

import {
  GestureClassifier,
  gestureKey,
  negativeRecordings,
  renderPerformance,
  replayRecording,
  rigPose,
  sampleRecordings,
  type GestureEvent,
  type HandFrame,
  type RigSegment,
} from '..';

function run(frames: HandFrame[], classifier = new GestureClassifier()): GestureEvent[] {
  const events: GestureEvent[] = [];
  for (const frame of frames) {
    events.push(...classifier.push(frame));
  }
  events.push(...classifier.flush(frames[frames.length - 1].t, true));
  return events;
}

function keys(events: GestureEvent[]): string[] {
  return events.filter((e) => e.phase !== 'end').map((e) => gestureKey(e));
}

const pinchOnce: RigSegment[] = [{ to: { shape: 'pinch' }, over: 70 }, { hold: 130 }, { to: { shape: 'point' }, over: 70 }];

describe('sample recordings', () => {
  it('cover every gesture of the vocabulary', () => {
    const covered = new Set(sampleRecordings().flatMap((r) => r.expected.map((k) => k.replace(/_(left|right|up|down)$/, ''))));
    for (const gesture of [
      'open_palm',
      'point',
      'pinch',
      'double_pinch',
      'pinch_hold',
      'fist',
      'swipe_two',
      'swipe_three',
      'circle_cw',
      'circle_ccw',
      'flick',
    ]) {
      expect(covered).toContain(gesture);
    }
  });

  it.each(sampleRecordings().map((r) => [r.id, r] as const))('recognizes %s', (_id, recording) => {
    const result = replayRecording(recording);
    expect(result.keys).toEqual(recording.expected);
    expect(result.passed).toBe(true);
  });

  it.each(negativeRecordings().map((r) => [r.id, r] as const))('does not invent gestures in %s', (_id, recording) => {
    expect(replayRecording(recording).keys).toEqual(recording.expected);
  });

  it('stays correct across frame rates, tracker noise and random seeds', () => {
    const failures: string[] = [];
    for (const fps of [15, 30, 60]) {
      for (const noise of [0.002, 0.004]) {
        for (const seed of [1, 2, 3]) {
          for (const recording of [...sampleRecordings({ fps, noise, seed: seed * 1000 }), ...negativeRecordings({ fps, noise, seed: seed * 1000 })]) {
            const result = replayRecording(recording);
            if (!result.passed) {
              failures.push(`${recording.id} at ${fps} fps, noise ${noise}, seed ${seed}: ${result.keys.join(', ')}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('GestureClassifier', () => {
  it('reports the direction of swipes and flicks in screen space', () => {
    const left = renderPerformance(rigPose('two_fingers', { x: 0.7, y: 0.6 }), [
      { hold: 300 },
      { to: { wrist: { x: 0.3, y: 0.6 } }, over: 250 },
      { hold: 300 },
    ]);
    expect(keys(run(left))).toEqual(['swipe_two_left']);

    const down = renderPerformance(rigPose('point', { x: 0.5, y: 0.45 }), [
      { hold: 450 },
      { to: { wrist: { x: 0.5, y: 0.68 } }, over: 110, easing: 'linear' },
      { hold: 300 },
    ]);
    expect(keys(run(down))).toEqual(['point', 'flick_down']);
  });

  it('reports a pinch where it started, not where the fingers released', () => {
    const frames = renderPerformance(rigPose('point', { x: 0.4, y: 0.6 }), [{ hold: 400 }, ...pinchOnce, { hold: 500 }], {
      noise: 0,
    });
    const pinch = run(frames).find((e) => e.kind === 'pinch');
    expect(pinch).toBeDefined();
    // The rig pinch point sits a little left of and below the raised index tip.
    expect(pinch!.position.x).toBeGreaterThan(0.3);
    expect(pinch!.position.x).toBeLessThan(0.4);
  });

  it('emits two single pinches when the second one comes after the double pinch window', () => {
    const frames = renderPerformance(rigPose('point', { x: 0.5, y: 0.6 }), [
      { hold: 400 },
      ...pinchOnce,
      { hold: 600 },
      ...pinchOnce,
      { hold: 600 },
    ]);
    expect(keys(run(frames))).toEqual(['point', 'pinch', 'pinch']);
  });

  it('emits a single pinch right away when deferral is off', () => {
    const classifier = new GestureClassifier({ pinch: { deferSingle: false } });
    const frames = renderPerformance(rigPose('point', { x: 0.5, y: 0.6 }), [{ hold: 400 }, ...pinchOnce, { hold: 100 }]);
    const events: GestureEvent[] = [];
    for (const frame of frames) {
      events.push(...classifier.push(frame));
    }
    expect(keys(events)).toEqual(['point', 'pinch']);
  });

  it('ends a pinch and hold when the hand leaves the frame', () => {
    const frames = renderPerformance(rigPose('point', { x: 0.5, y: 0.6 }), [
      { hold: 400 },
      { to: { shape: 'pinch' }, over: 70 },
      { hold: 800 },
      { hide: 200 },
    ]);
    const events = run(frames);
    expect(events.map((e) => `${e.kind}${e.phase ? `:${e.phase}` : ''}`)).toEqual([
      'point',
      'pinch_hold:start',
      'pinch_hold:end',
    ]);
  });

  it('freezes the cursor during a short pinch and lets it follow during a hold', () => {
    const classifier = new GestureClassifier({ smoothing: null });
    const frames = renderPerformance(
      rigPose('point', { x: 0.5, y: 0.6 }),
      [
        { hold: 300 },
        { to: { shape: 'pinch' }, over: 70 },
        { hold: 200 },
        { to: { wrist: { x: 0.55, y: 0.6 } }, over: 100 },
      ],
      { noise: 0 },
    );
    let frozen = null as { x: number; y: number } | null;
    for (const frame of frames) {
      classifier.push(frame);
      const snapshot = classifier.snapshot;
      if (snapshot.pinching && frozen === null) {
        frozen = snapshot.cursor;
      }
    }
    // The hand moved while pinching but before the hold, so the cursor stayed put.
    expect(classifier.snapshot.pinching).toBe(true);
    expect(classifier.snapshot.holding).toBe(false);
    expect(classifier.snapshot.cursor).toEqual(frozen);

    const holding = renderPerformance(rigPose('pinch', { x: 0.55, y: 0.6 }), [{ hold: 500 }, { to: { wrist: { x: 0.65, y: 0.6 } }, over: 200 }], {
      noise: 0,
      startT: frames[frames.length - 1].t + 33.3,
    });
    for (const frame of holding) {
      classifier.push(frame);
    }
    expect(classifier.snapshot.holding).toBe(true);
    expect(classifier.snapshot.cursor!.x).toBeGreaterThan(frozen!.x + 0.1);
  });

  it('ignores frames that arrive out of order', () => {
    const classifier = new GestureClassifier();
    const frames = renderPerformance(rigPose('fist', { x: 0.5, y: 0.6 }), [{ hold: 500 }]);
    const shuffled = [frames[5], frames[2], ...frames.slice(6)];
    const events = shuffled.flatMap((f) => classifier.push(f));
    expect(keys(events)).toEqual(['fist']);
  });

  it('reports no hand when the tracker loses it', () => {
    const classifier = new GestureClassifier();
    for (const frame of renderPerformance(rigPose('open_palm', { x: 0.5, y: 0.6 }), [{ hold: 200 }])) {
      classifier.push(frame);
    }
    expect(classifier.snapshot.handVisible).toBe(true);
    classifier.push({ t: 1000, landmarks: null });
    expect(classifier.snapshot).toEqual({ pose: 'none', handVisible: false, cursor: null, pinching: false, holding: false });
  });

  it('rejects landmark arrays of the wrong size or with invalid numbers', () => {
    const classifier = new GestureClassifier();
    const frame = renderPerformance(rigPose('fist', { x: 0.5, y: 0.6 }), [{ hold: 40 }])[0];
    const broken = frame.landmarks!.map((p, i) => (i === 3 ? { ...p, x: Number.NaN } : p));
    expect(classifier.push({ t: 0, landmarks: frame.landmarks!.slice(0, 20) })).toEqual([]);
    expect(classifier.push({ t: 33, landmarks: broken })).toEqual([]);
    expect(classifier.snapshot.handVisible).toBe(false);
  });
});
