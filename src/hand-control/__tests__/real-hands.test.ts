import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { GestureClassifier } from '../../gesture-engine/classifier';
import { unflattenLandmarks } from '../../gesture-engine/landmarks';
import fixtures from '../__fixtures__/mediapipe-hands.json';
import { HandControl, type HandControlNative } from '../controller';
import { handQuality, HandSelector, rejectHand } from '../robustness';

/**
 * Landmarks MediaPipe returned for its own photos of hands on the x86
 * emulator (see the fixture's about). The synthetic recordings tuned the
 * classifier; these check it against real hands.
 */
interface Fixture {
  image: string;
  handedness: string | null;
  score: number;
  landmarks: number[];
}

const ASPECT = fixtures.frameAspect;
const HANDS = fixtures.hands as Fixture[];
const SCREEN = { width: 1080, height: 2400 };

function fixture(image: string): Fixture {
  const found = HANDS.find((hand) => hand.image === image);
  if (!found) throw new Error(`no fixture for ${image}`);
  return found;
}

/** The pose the classifier settles on when the same real hand stays in view for a second. */
function poseOf(landmarks: number[]): string {
  const classifier = new GestureClassifier({ frameAspect: ASPECT });
  for (let i = 0; i < 30; i++) classifier.push({ t: i * 33, landmarks: unflattenLandmarks(landmarks), score: 1 });
  return classifier.snapshot.pose;
}

/** The landmarks moved by dx, dy (in frame units) and scaled around the wrist, like a hand moving or further away. */
function moved(landmarks: number[], dx: number, dy: number, scale = 1): number[] {
  const wx = landmarks[0];
  const wy = landmarks[1];
  return landmarks.map((value, index) => {
    if (index % 3 === 0) return wx + (value - wx) * scale + dx;
    if (index % 3 === 1) return wy + (value - wy) * scale + dy;
    return value * scale;
  });
}

function control(log: string[], cursor: { x: number; y: number }[]): HandControl {
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      log.push(`${name} ${args.join(' ')}`.trim());
      return true;
    };
  const native: HandControlNative = {
    tap: record('tap'),
    doubleTap: record('doubleTap'),
    longPress: record('longPress'),
    swipe: record('swipe'),
    scroll: record('scroll'),
    globalAction: record('globalAction'),
    mediaKey: record('mediaKey'),
    adjustVolume: record('adjustVolume'),
    changeBrightness: async () => 'done',
    openApp: record('openApp'),
    moveCursor: (x, y) => cursor.push({ x, y }),
    hideCursor: () => undefined,
    showCursor: () => true,
  };
  return new HandControl({
    native,
    profiles: ProfileRegistry.withBuiltins(),
    ui: {
      sphere: (action) => log.push(`sphere ${action}`),
      listen: () => log.push('listen'),
      cursor: (action) => log.push(`cursor ${action}`),
      pause: () => log.push('pause'),
      needsAccess: (access) => log.push(`needsAccess ${access}`),
    },
    screen: SCREEN,
    foreground: () => 'com.example.app',
  });
}

describe('real hands from MediaPipe', () => {
  it('has the six photos', () => {
    expect(HANDS.map((hand) => hand.image).sort()).toEqual(
      ['fist.jpg', 'left_hands.jpg', 'pointing_up.jpg', 'right_hands.jpg', 'thumb_up.jpg', 'victory.jpg'].sort(),
    );
    for (const hand of HANDS) expect(hand.landmarks).toHaveLength(63);
  });

  it.each([
    ['pointing_up.jpg', 'point'],
    ['fist.jpg', 'fist'],
    ['victory.jpg', 'two_fingers'],
    ['right_hands.jpg', 'open_palm'],
    ['left_hands.jpg', 'open_palm'],
  ])('reads %s as %s', (image, pose) => {
    expect(poseOf(fixture(image).landmarks)).toBe(pose);
  });

  it('does not take a thumbs up for a fist, which would start listening', () => {
    expect(poseOf(fixture('thumb_up.jpg').landmarks)).not.toBe('fist');
  });

  it('keeps every real hand as the user hand', () => {
    for (const hand of HANDS) {
      const candidate = { landmarks: hand.landmarks, score: hand.score, handedness: null };
      expect(rejectHand(candidate, handQuality(hand.landmarks, ASPECT))).toBeNull();
    }
    const selector = new HandSelector();
    const far = moved(fixture('right_hands.jpg').landmarks, 0.25, -0.2, 0.15);
    const near = fixture('pointing_up.jpg');
    expect(selector.choose([{ landmarks: far, score: 0.9, handedness: 'left' }, { landmarks: near.landmarks, score: near.score, handedness: 'right' }], ASPECT).hand?.landmarks).toBe(
      near.landmarks,
    );
  });

  it('moves the cursor across the whole screen with a real pointing hand, never stuck at an edge', () => {
    // A real hand further from the camera, sliding so the index tip crosses the frame both ways.
    const base = moved(fixture('pointing_up.jpg').landmarks, 0, 0, 0.5);
    const tip = { x: base[8 * 3], y: base[8 * 3 + 1] };
    const xs: number[] = [];
    const ys: number[] = [];
    const sweep = (axis: 'x' | 'y') => {
      const cursor: { x: number; y: number }[] = [];
      const hands = control([], cursor);
      let t = 0;
      for (let k = 0; k <= 60; k++) {
        const target = 0.12 + (0.76 * Math.min(k, 50)) / 50;
        const dx = axis === 'x' ? target - tip.x : 0.5 - tip.x;
        const dy = axis === 'y' ? target - tip.y : 0.4 - tip.y;
        hands.push({ t: (t += 33), landmarks: moved(base, dx, dy), score: 1, handedness: 'right', aspect: ASPECT, brightness: 120 });
      }
      return cursor;
    };
    for (const point of sweep('x')) xs.push(point.x);
    for (const point of sweep('y')) ys.push(point.y);
    expect(Math.min(...xs)).toBeLessThan(SCREEN.width * 0.05);
    expect(Math.max(...xs)).toBeGreaterThan(SCREEN.width * 0.95);
    expect(Math.min(...ys)).toBeLessThan(SCREEN.height * 0.05);
    expect(Math.max(...ys)).toBeGreaterThan(SCREEN.height * 0.95);
  });

  it('acts on a real open palm and a real fist once the hand is steady, once each', () => {
    const log: string[] = [];
    const hands = control(log, []);
    let t = 0;
    for (const image of ['right_hands.jpg', 'fist.jpg']) {
      for (let i = 0; i < 30; i++) {
        hands.push({ t: (t += 33), landmarks: fixture(image).landmarks, score: 1, handedness: 'right', aspect: ASPECT, brightness: 120 });
      }
      for (let i = 0; i < 6; i++) hands.push({ t: (t += 33), landmarks: [], score: 0, handedness: null, aspect: ASPECT, brightness: 120 });
    }
    expect(log.filter((entry) => entry === 'sphere toggle')).toHaveLength(1);
    expect(log.filter((entry) => entry === 'listen')).toHaveLength(1);
  });
});
