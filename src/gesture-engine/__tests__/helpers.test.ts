import { describe, expect, it } from '@jest/globals';

import {
  describeGesture,
  dominantDirection,
  flattenLandmarks,
  GESTURE_KEYS,
  gestureKey,
  HAND_LANDMARK_COUNT,
  isGestureKey,
  mapToScreen,
  rigLandmarks,
  rigPose,
  unflattenLandmarks,
  wrapAngle,
} from '..';

describe('gesture keys', () => {
  it('builds directional keys for swipes and flicks', () => {
    expect(gestureKey({ kind: 'swipe_two', direction: 'left' })).toBe('swipe_two_left');
    expect(gestureKey({ kind: 'flick', direction: 'down' })).toBe('flick_down');
    expect(gestureKey({ kind: 'double_pinch' })).toBe('double_pinch');
  });

  it('has a readable label for every key', () => {
    for (const key of GESTURE_KEYS) {
      const label = describeGesture(key);
      expect(label.length).toBeGreaterThan(3);
      expect(label).not.toContain('_');
    }
    expect(describeGesture('swipe_three_up')).toBe('Three finger swipe up');
  });

  it('validates keys', () => {
    expect(isGestureKey('circle_cw')).toBe(true);
    expect(isGestureKey('swipe_two')).toBe(false);
  });
});

describe('landmark packing', () => {
  it('round trips through the flat format used by native trackers', () => {
    const landmarks = rigLandmarks(rigPose('point', { x: 0.5, y: 0.6 }));
    const flat = flattenLandmarks(landmarks);
    expect(flat).toHaveLength(HAND_LANDMARK_COUNT * 3);
    expect(unflattenLandmarks(flat)).toEqual(landmarks);
    expect(unflattenLandmarks(flat.slice(1))).toBeNull();
  });
});

describe('geometry helpers', () => {
  it('wraps angles into the half open range from minus pi to pi', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBe(0.5);
  });

  it('finds the dominant direction in screen space', () => {
    expect(dominantDirection(0.3, 0.05, 1.8)).toBe('right');
    expect(dominantDirection(0, -0.2, 1.8)).toBe('up');
    expect(dominantDirection(0.2, 0.2, 1.8)).toBeNull();
  });
});

describe('mapToScreen', () => {
  const box = { left: 0.2, top: 0.1, right: 0.8, bottom: 0.7 };
  const screen = { width: 1080, height: 2400 };

  it('maps the control box corners to the screen corners', () => {
    expect(mapToScreen({ x: 0.2, y: 0.1 }, box, screen)).toEqual({ x: 0, y: 0 });
    expect(mapToScreen({ x: 0.8, y: 0.7 }, box, screen)).toEqual({ x: 1080, y: 2400 });
    const center = mapToScreen({ x: 0.5, y: 0.4 }, box, screen);
    expect(center.x).toBeCloseTo(540);
    expect(center.y).toBeCloseTo(1200);
  });

  it('clamps positions outside the box to the screen edge', () => {
    expect(mapToScreen({ x: 0, y: 1 }, box, screen)).toEqual({ x: 0, y: 2400 });
  });
});
