import { describe, expect, it } from '@jest/globals';

import { flattenLandmarks } from '../../gesture-engine/landmarks';
import { rigLandmarks, rigPose, type RigShapeName } from '../../gesture-engine/synthetic';
import {
  ActionGuard,
  CursorMotion,
  handQuality,
  HandSelector,
  LightGate,
  rejectHand,
  StabilityGate,
  trackerCondition,
  type HandCandidate,
} from '../robustness';

const ASPECT = 3 / 4;

function hand(shape: RigShapeName, x: number, y: number, scale = 0.16, side: 'left' | 'right' = 'right', score = 0.95): HandCandidate {
  return { landmarks: flattenLandmarks(rigLandmarks(rigPose(shape, { x, y }, scale), ASPECT)), score, handedness: side };
}

describe('which hand is the user', () => {
  it('measures a hand in the middle of the frame as whole and large enough', () => {
    const candidate = hand('open_palm', 0.5, 0.7);
    const quality = handQuality(candidate.landmarks, ASPECT);
    expect(quality.inside).toBe(true);
    expect(quality.palm).toBeGreaterThan(0.06);
    expect(rejectHand(candidate, quality)).toBeNull();
  });

  it('leaves out a hand far in the background, one cut by the edge, and an unsure detection', () => {
    const far = hand('open_palm', 0.5, 0.6, 0.03);
    expect(rejectHand(far, handQuality(far.landmarks, ASPECT))).toBe('too_small');
    const cut = hand('point', 1.04, 0.7);
    expect(rejectHand(cut, handQuality(cut.landmarks, ASPECT))).toBe('cut_off');
    const unsure = hand('open_palm', 0.5, 0.7, 0.16, 'right', 0.3);
    expect(rejectHand(unsure, handQuality(unsure.landmarks, ASPECT))).toBe('low_score');
  });

  it('picks the closest hand, says why none was picked, and keeps the same hand when a bigger one enters', () => {
    const selector = new HandSelector();
    const near = hand('point', 0.45, 0.7, 0.18);
    const background = hand('open_palm', 0.75, 0.4, 0.07, 'left');
    expect(selector.choose([background, near], ASPECT).hand).toBe(near);

    const intruder = hand('open_palm', 0.15, 0.75, 0.2, 'left');
    const sameAgain = hand('point', 0.46, 0.7, 0.18);
    expect(selector.choose([intruder, sameAgain], ASPECT).hand).toBe(sameAgain);

    const lonely = new HandSelector();
    expect(lonely.choose([hand('open_palm', 0.5, 0.6, 0.03)], ASPECT)).toEqual({ hand: null, ignored: 'too_small' });
    expect(lonely.choose([], ASPECT)).toEqual({ hand: null, ignored: null });
  });
});

describe('acting only on a steady hand', () => {
  it('waits for a few frames and a little time, and starts over when the hand leaves', () => {
    const gate = new StabilityGate(4, 120);
    expect([0, 33, 66].map((t) => gate.update(true, t))).toEqual([false, false, false]);
    expect(gate.update(true, 99)).toBe(false);
    expect(gate.update(true, 132)).toBe(true);
    expect(gate.update(false, 165)).toBe(false);
    expect(gate.update(true, 198)).toBe(false);
  });
});

describe('light', () => {
  it('calls the room too dark only after a while, and clears only when it is clearly brighter', () => {
    const gate = new LightGate(35, 50, 600);
    expect(gate.update(20, 0)).toBe(false);
    expect(gate.update(20, 500)).toBe(false);
    expect(gate.update(20, 650)).toBe(true);
    expect(gate.update(45, 800)).toBe(true);
    expect(gate.update(60, 900)).toBe(true);
    expect(gate.update(60, 1400)).toBe(true);
    expect(gate.update(60, 1500)).toBe(false);
    expect(gate.update(null, 1800)).toBe(false);
  });
});

describe('gestures that come too fast', () => {
  it('spaces actions, holds back a repeated gesture and stops a burst', () => {
    const guard = new ActionGuard(250, 700, 4, 3000, 2000);
    expect(guard.allow('pinch', 0)).toBe(true);
    expect(guard.allow('flick_up', 100)).toBe(false);
    expect(guard.allow('pinch', 500)).toBe(false);
    expect(guard.allow('flick_up', 500)).toBe(true);
    expect(guard.allow('pinch', 800)).toBe(true);
    expect(guard.allow('fist', 1100)).toBe(true);
    // A fifth action within three seconds looks like a loop: everything waits two seconds.
    expect(guard.allow('open_palm', 1400)).toBe(false);
    expect(guard.allow('swipe_two_left', 2000)).toBe(false);
    expect(guard.allow('swipe_two_left', 3500)).toBe(true);
  });
});

describe('the cursor when the hand comes and goes', () => {
  it('freezes and fades, disappears after a while, and glides back from where it froze', () => {
    const motion = new CursorMotion(1200, 160);
    expect(motion.update({ x: 100, y: 200 }, 0)).toEqual({ position: { x: 100, y: 200 }, look: 'live' });
    expect(motion.update(null, 33)).toEqual({ position: { x: 100, y: 200 }, look: 'lost' });
    expect(motion.update(null, 600)).toEqual({ position: { x: 100, y: 200 }, look: 'lost' });
    const back = motion.update({ x: 300, y: 200 }, 700);
    expect(back.look).toBe('live');
    expect(back.position).toEqual({ x: 100, y: 200 });
    const halfway = motion.update({ x: 300, y: 200 }, 780);
    expect(halfway.position?.x).toBeCloseTo(200, 0);
    expect(motion.update({ x: 300, y: 200 }, 900).position).toEqual({ x: 300, y: 200 });
    expect(motion.update(null, 1000).look).toBe('lost');
    expect(motion.update(null, 2300)).toEqual({ position: null, look: 'hidden' });
  });
});

describe('what the bubble and Live say', () => {
  it('puts camera trouble first, then heat, light and the hand', () => {
    expect(trackerCondition('busy', 4, true, 'none')).toBe('camera_busy');
    expect(trackerCondition('disabled', 0, false, 'ready')).toBe('camera_disabled');
    expect(trackerCondition('error', 0, false, 'ready')).toBe('camera_error');
    expect(trackerCondition('ok', 3, true, 'ready')).toBe('hot');
    expect(trackerCondition('ok', 2, true, 'ready')).toBe('too_dark');
    expect(trackerCondition('ok', 0, false, 'ignored')).toBe('ignored_hand');
    expect(trackerCondition('starting', 0, false, 'none')).toBe('no_hand');
    expect(trackerCondition('ok', 0, false, 'settling')).toBe('settling');
    expect(trackerCondition('ok', 0, false, 'ready')).toBe('ok');
  });
});
