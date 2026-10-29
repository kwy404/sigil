import { circlePath, renderPerformance, rigPose, type RigSegment, type RigShapeName } from '../gesture-engine';
import type { AlbumId } from './gestures';

/**
 * Short hand performances for the previews, made with the synthetic hand rig
 * the tests use: the same 21 landmarks a camera reports, scripted to show each
 * sign clearly. Frames are normalized into a unit square for drawing.
 */
export interface HandClip {
  fps: number;
  frameCount: number;
  /** x, y of the 21 landmarks per frame, 0 to 1, or NaN where the hand is hidden. */
  points: number[];
  /** 1 on frames where thumb and index touch. */
  pinch: number[];
  /** Landmark that leaves a light trail, or -1. */
  trailTip: number;
}

export type ClipId = AlbumId | 'idle';

const C = { x: 0.5, y: 0.64 };
const FPS = 30;

interface Script {
  shape: RigShapeName;
  wrist?: { x: number; y: number };
  segments: RigSegment[];
  trail?: boolean;
}

const SCRIPTS: Record<ClipId, Script> = {
  idle: {
    shape: 'open_palm',
    segments: [{ hold: 400 }, { to: { roll: 0.07 }, over: 1100 }, { to: { roll: -0.05 }, over: 1300 }, { to: { roll: 0 }, over: 900 }],
  },
  point: {
    shape: 'fist',
    segments: [{ hold: 300 }, { to: { shape: 'point' }, over: 280 }, { hold: 1100 }, { to: { shape: 'fist' }, over: 300 }, { hold: 300 }],
  },
  pinch: {
    shape: 'point',
    segments: [{ hold: 500 }, { to: { shape: 'pinch' }, over: 120 }, { hold: 260 }, { to: { shape: 'point' }, over: 160 }, { hold: 700 }],
  },
  'double-pinch': {
    shape: 'point',
    segments: [
      { hold: 500 },
      { to: { shape: 'pinch' }, over: 90 },
      { hold: 120 },
      { to: { shape: 'point' }, over: 90 },
      { hold: 150 },
      { to: { shape: 'pinch' }, over: 90 },
      { hold: 120 },
      { to: { shape: 'point' }, over: 90 },
      { hold: 800 },
    ],
  },
  'pinch-hold': {
    shape: 'point',
    segments: [{ hold: 500 }, { to: { shape: 'pinch' }, over: 120 }, { hold: 1300 }, { to: { shape: 'point' }, over: 160 }, { hold: 600 }],
  },
  'open-palm': {
    shape: 'fist',
    segments: [{ hold: 300 }, { to: { shape: 'open_palm' }, over: 420 }, { hold: 1300 }, { to: { shape: 'fist' }, over: 350 }, { hold: 250 }],
  },
  fist: {
    shape: 'open_palm',
    segments: [{ hold: 600 }, { to: { shape: 'fist' }, over: 280 }, { hold: 1000 }, { to: { shape: 'open_palm' }, over: 400 }, { hold: 300 }],
  },
  'volume-knob': {
    shape: 'point',
    trail: true,
    segments: [
      { hold: 300 },
      { to: { shape: 'pinch' }, over: 120 },
      { path: circlePath(0.05, true, 0.85), over: 1500 },
      { to: { shape: 'point' }, over: 160 },
      { hold: 500 },
    ],
  },
  'brightness-slider': {
    shape: 'point',
    trail: true,
    segments: [
      { hold: 300 },
      { to: { shape: 'pinch' }, over: 120 },
      { to: { wrist: { x: C.x, y: C.y - 0.1 } }, over: 700 },
      { to: { wrist: { x: C.x, y: C.y + 0.02 } }, over: 800 },
      { to: { shape: 'point' }, over: 160 },
      { hold: 400 },
    ],
  },
  scroll: {
    shape: 'two_fingers',
    trail: true,
    wrist: { x: C.x, y: C.y + 0.05 },
    segments: [
      { hold: 350 },
      { to: { wrist: { x: C.x, y: C.y - 0.09 } }, over: 260 },
      { hold: 250 },
      { hide: 300 },
      { to: { wrist: { x: C.x, y: C.y + 0.05 } }, over: 33 },
      { hold: 300 },
    ],
  },
  swipe: {
    shape: 'two_fingers',
    trail: true,
    wrist: { x: C.x - 0.08, y: C.y },
    segments: [
      { hold: 350 },
      { to: { wrist: { x: C.x + 0.08, y: C.y } }, over: 260 },
      { hold: 250 },
      { hide: 300 },
      { to: { wrist: { x: C.x - 0.08, y: C.y } }, over: 33 },
      { hold: 300 },
    ],
  },
  'three-fingers': {
    shape: 'three_fingers',
    trail: true,
    wrist: { x: C.x, y: C.y + 0.05 },
    segments: [
      { hold: 400 },
      { to: { wrist: { x: C.x, y: C.y - 0.09 } }, over: 280 },
      { hold: 250 },
      { hide: 300 },
      { to: { wrist: { x: C.x, y: C.y + 0.05 } }, over: 33 },
      { hold: 300 },
    ],
  },
  circle: {
    shape: 'point',
    trail: true,
    wrist: { x: C.x + 0.035, y: C.y },
    segments: [{ hold: 300 }, { path: circlePath(0.07, true, 1), over: 1400 }, { hold: 600 }],
  },
  flick: {
    shape: 'point',
    trail: true,
    segments: [
      { hold: 600 },
      { to: { wrist: { x: C.x, y: C.y - 0.1 } }, over: 110, easing: 'linear' },
      { hold: 300 },
      { to: { wrist: C }, over: 520 },
      { hold: 300 },
    ],
  },
};

const cache = new Map<ClipId, HandClip>();

function build(script: Script): HandClip {
  const frames = renderPerformance(rigPose(script.shape, script.wrist ?? C), script.segments, { fps: FPS, noise: 0 });
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const frame of frames) {
    for (const point of frame.landmarks ?? []) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const pad = 0.14;
  const scale = (1 - 2 * pad) / span;
  const offsetX = pad + ((1 - 2 * pad) - (maxX - minX) * scale) / 2;
  const offsetY = pad + ((1 - 2 * pad) - (maxY - minY) * scale) / 2;

  const points: number[] = [];
  const pinch: number[] = [];
  for (const frame of frames) {
    const landmarks = frame.landmarks;
    if (!landmarks) {
      for (let i = 0; i < 21; i++) points.push(Number.NaN, Number.NaN);
      pinch.push(0);
      continue;
    }
    for (const point of landmarks) {
      points.push(offsetX + (point.x - minX) * scale, offsetY + (point.y - minY) * scale);
    }
    const dx = landmarks[4].x - landmarks[8].x;
    const dy = landmarks[4].y - landmarks[8].y;
    const hand = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
    // A pinch has the index reaching out; in a fist the tips also meet, but folded into the palm.
    const reach = Math.hypot(landmarks[8].x - landmarks[0].x, landmarks[8].y - landmarks[0].y);
    pinch.push(Math.hypot(dx, dy) < hand * 0.3 && reach > hand * 1.3 ? 1 : 0);
  }
  return { fps: FPS, frameCount: frames.length, points, pinch, trailTip: script.trail ? 8 : -1 };
}

/** The clip of an album, or the resting hand. Built once, then cached. */
export function handClip(id: ClipId): HandClip {
  let clip = cache.get(id);
  if (!clip) {
    clip = build(SCRIPTS[id]);
    cache.set(id, clip);
  }
  return clip;
}

/** Pairs of landmarks joined by a bone: the palm, then each finger from base to tip. */
export const HAND_BONES: readonly (readonly [number, number])[] = [
  [0, 1],
  [0, 5],
  [0, 17],
  [5, 9],
  [9, 13],
  [13, 17],
  [1, 2],
  [2, 3],
  [3, 4],
  [5, 6],
  [6, 7],
  [7, 8],
  [9, 10],
  [10, 11],
  [11, 12],
  [13, 14],
  [14, 15],
  [15, 16],
  [17, 18],
  [18, 19],
  [19, 20],
];

export const FINGERTIPS: readonly number[] = [4, 8, 12, 16, 20];
