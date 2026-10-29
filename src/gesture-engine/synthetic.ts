/**
 * A small kinematic hand rig that produces the 21 landmarks for a hand shape.
 * Tests and sample recordings use it so the classifier can be exercised
 * without a camera. It is not meant to be anatomically exact, only plausible
 * enough to cover the same geometry a hand tracker reports.
 */
import { lerp } from './geometry';
import type { HandFrame, Landmark, Vec2 } from './landmarks';

export interface FingerCurls {
  thumb: number;
  index: number;
  middle: number;
  ring: number;
  pinky: number;
}

export interface RigPose {
  /** Wrist position in normalized frame coordinates. */
  wrist: Vec2;
  /** Wrist to middle finger base distance, in frame widths. */
  scale: number;
  /** In plane rotation in radians. 0 means the fingers point up. */
  roll: number;
  /** 0 is straight, 1 is fully curled. */
  curl: FingerCurls;
  /** 0 is open, 1 means the thumb tip touches the index tip. */
  pinch: number;
}

export type RigShapeName = 'open_palm' | 'point' | 'fist' | 'two_fingers' | 'three_fingers' | 'pinch';

export const RIG_SHAPES: Readonly<Record<RigShapeName, { curl: FingerCurls; pinch: number }>> = {
  open_palm: { curl: { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }, pinch: 0 },
  point: { curl: { thumb: 0.8, index: 0, middle: 1, ring: 1, pinky: 1 }, pinch: 0 },
  fist: { curl: { thumb: 1, index: 1, middle: 1, ring: 1, pinky: 1 }, pinch: 0 },
  two_fingers: { curl: { thumb: 0.8, index: 0, middle: 0, ring: 1, pinky: 1 }, pinch: 0 },
  three_fingers: { curl: { thumb: 0.8, index: 0, middle: 0, ring: 0, pinky: 1 }, pinch: 0 },
  pinch: { curl: { thumb: 0.3, index: 0, middle: 1, ring: 1, pinky: 1 }, pinch: 1 },
};

export function rigPose(shape: RigShapeName, wrist: Vec2, scale = 0.16, roll = 0): RigPose {
  const s = RIG_SHAPES[shape];
  return { wrist: { ...wrist }, scale, roll, curl: { ...s.curl }, pinch: s.pinch };
}

type Vec3 = [number, number, number];

const DEG = Math.PI / 180;

/** Base joint, spread angle in degrees and segment lengths, in palm sizes. */
const FINGER_GEOMETRY: Record<'index' | 'middle' | 'ring' | 'pinky', { base: Vec3; tilt: number; lengths: Vec3 }> = {
  index: { base: [-0.3, 0.92, 0], tilt: -8, lengths: [0.42, 0.25, 0.21] },
  middle: { base: [0, 1, 0], tilt: 0, lengths: [0.47, 0.29, 0.22] },
  ring: { base: [0.26, 0.95, 0], tilt: 7, lengths: [0.44, 0.27, 0.21] },
  pinky: { base: [0.48, 0.84, 0], tilt: 15, lengths: [0.34, 0.2, 0.18] },
};

/** Flexion of the base, middle and outer joint at full curl, in degrees. */
const FINGER_FLEX: Vec3 = [85, 100, 70];

const THUMB_CMC: Vec3 = [-0.22, 0.18, 0];
const THUMB_LENGTHS: Vec3 = [0.32, 0.26, 0.22];
const THUMB_OPEN_ANGLE = 55;
const THUMB_FOLD: Vec3 = [20, 55, 85];
const THUMB_DEPTH: Vec3 = [10, 25, 35];

function add(a: Vec3, b: Vec3, k = 1): Vec3 {
  return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
}

function mix(a: Vec3, b: Vec3, k: number): Vec3 {
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
}

function fingerChain(finger: keyof typeof FINGER_GEOMETRY, curl: number): Vec3[] {
  const g = FINGER_GEOMETRY[finger];
  const tilt = g.tilt * DEG;
  const points: Vec3[] = [g.base];
  let p = g.base;
  let phi = 0;
  for (let k = 0; k < 3; k++) {
    phi += FINGER_FLEX[k] * curl * DEG;
    const d: Vec3 = [Math.sin(tilt) * Math.cos(phi), Math.cos(tilt) * Math.cos(phi), Math.sin(phi)];
    p = add(p, d, g.lengths[k]);
    points.push(p);
  }
  return points;
}

function thumbChain(curl: number): Vec3[] {
  const points: Vec3[] = [THUMB_CMC];
  let p = THUMB_CMC;
  for (let k = 0; k < 3; k++) {
    const a = (THUMB_OPEN_ANGLE - THUMB_FOLD[k] * curl) * DEG;
    const b = THUMB_DEPTH[k] * curl * DEG;
    const d: Vec3 = [-Math.sin(a) * Math.cos(b), Math.cos(a) * Math.cos(b), Math.sin(b)];
    p = add(p, d, THUMB_LENGTHS[k]);
    points.push(p);
  }
  return points;
}

/** Thumb chain bent so its tip rests on the given target. */
function pinchedThumbChain(target: Vec3): Vec3[] {
  const du = target[0] - THUMB_CMC[0];
  const dv = target[1] - THUMB_CMC[1];
  const length = Math.max(Math.hypot(du, dv), 1e-6);
  const perp: Vec3 = [-dv / length, du / length, 0];
  return [
    THUMB_CMC,
    add(add(THUMB_CMC, [du, dv, target[2]], 0.38), perp, 0.1),
    add(add(THUMB_CMC, [du, dv, target[2]], 0.7), perp, 0.07),
    target,
  ];
}

/**
 * Landmarks for a rig pose. aspect is the frame width divided by its height,
 * so the hand keeps its proportions on non square frames.
 */
export function rigLandmarks(pose: RigPose, aspect = 1): Landmark[] {
  const pinch = Math.max(0, Math.min(1, pose.pinch));
  const indexCurl = lerp(pose.curl.index, 0.32, pinch);
  const index = fingerChain('index', indexCurl);
  let thumb = thumbChain(pose.curl.thumb);
  if (pinch > 0) {
    const tip = index[3];
    const pinched = pinchedThumbChain([tip[0] - 0.03, tip[1] - 0.02, tip[2]]);
    thumb = thumb.map((p, i) => mix(p, pinched[i], pinch));
  }
  const local: Vec3[] = [
    [0, 0, 0],
    ...thumb,
    ...index,
    ...fingerChain('middle', pose.curl.middle),
    ...fingerChain('ring', pose.curl.ring),
    ...fingerChain('pinky', pose.curl.pinky),
  ];
  const cos = Math.cos(pose.roll);
  const sin = Math.sin(pose.roll);
  return local.map(([u, v, w]) => ({
    x: pose.wrist.x + pose.scale * (u * cos - v * sin),
    y: pose.wrist.y - pose.scale * (u * sin + v * cos) * aspect,
    z: -pose.scale * w,
  }));
}

/** Deterministic pseudo random generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number): number {
  const u1 = Math.max(random(), 1e-12);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export type Easing = 'linear' | 'smooth';

function ease(k: number, easing: Easing): number {
  return easing === 'smooth' ? k * k * (3 - 2 * k) : k;
}

export function interpolatePose(a: RigPose, b: RigPose, k: number): RigPose {
  return {
    wrist: { x: lerp(a.wrist.x, b.wrist.x, k), y: lerp(a.wrist.y, b.wrist.y, k) },
    scale: lerp(a.scale, b.scale, k),
    roll: lerp(a.roll, b.roll, k),
    curl: {
      thumb: lerp(a.curl.thumb, b.curl.thumb, k),
      index: lerp(a.curl.index, b.curl.index, k),
      middle: lerp(a.curl.middle, b.curl.middle, k),
      ring: lerp(a.curl.ring, b.curl.ring, k),
      pinky: lerp(a.curl.pinky, b.curl.pinky, k),
    },
    pinch: lerp(a.pinch, b.pinch, k),
  };
}

export interface PoseChange {
  wrist?: Vec2;
  scale?: number;
  roll?: number;
  shape?: RigShapeName;
  curl?: Partial<FingerCurls>;
  pinch?: number;
}

export function applyChange(pose: RigPose, change: PoseChange): RigPose {
  const shape = change.shape ? RIG_SHAPES[change.shape] : null;
  return {
    wrist: change.wrist ? { ...change.wrist } : { ...pose.wrist },
    scale: change.scale ?? pose.scale,
    roll: change.roll ?? pose.roll,
    curl: { ...pose.curl, ...(shape ? shape.curl : {}), ...change.curl },
    pinch: change.pinch ?? (shape ? shape.pinch : pose.pinch),
  };
}

/** One piece of a scripted hand performance. */
export type RigSegment =
  | { hold: number }
  | { to: PoseChange; over: number; easing?: Easing }
  | { path: (progress: number, from: RigPose) => RigPose; over: number }
  | { hide: number };

export interface RenderOptions {
  fps?: number;
  /** Standard deviation of the landmark noise, in normalized units. */
  noise?: number;
  seed?: number;
  aspect?: number;
  startT?: number;
}

/** Renders a scripted performance into tracker frames. */
export function renderPerformance(start: RigPose, segments: readonly RigSegment[], options: RenderOptions = {}): HandFrame[] {
  const fps = options.fps ?? 30;
  const noise = options.noise ?? 0.0025;
  const aspect = options.aspect ?? 1;
  const random = seededRandom(options.seed ?? 1);
  const step = 1000 / fps;
  const frames: HandFrame[] = [];
  let t = options.startT ?? 0;
  let pose = start;

  const emit = (p: RigPose | null) => {
    const landmarks = p
      ? rigLandmarks(p, aspect).map((l) => ({
          x: l.x + gaussian(random) * noise,
          y: l.y + gaussian(random) * noise,
          z: l.z + gaussian(random) * noise,
        }))
      : null;
    frames.push({ t: Math.round(t * 1000) / 1000, landmarks, score: p ? 0.95 : 0 });
    t += step;
  };

  for (const segment of segments) {
    if ('hold' in segment || 'hide' in segment) {
      const duration = 'hold' in segment ? segment.hold : segment.hide;
      const count = Math.max(1, Math.round(duration / step));
      for (let i = 0; i < count; i++) {
        emit('hold' in segment ? pose : null);
      }
      continue;
    }
    const count = Math.max(1, Math.round(segment.over / step));
    if ('to' in segment) {
      const target = applyChange(pose, segment.to);
      const easing = segment.easing ?? 'smooth';
      for (let i = 1; i <= count; i++) {
        emit(interpolatePose(pose, target, ease(i / count, easing)));
      }
      pose = target;
    } else {
      const from = pose;
      for (let i = 1; i <= count; i++) {
        emit(segment.path(i / count, from));
      }
      pose = segment.path(1, from);
    }
  }
  return frames;
}

/** Moves the wrist around a circle that starts at the current wrist position. */
export function circlePath(radius: number, clockwise: boolean, turns = 1): (progress: number, from: RigPose) => RigPose {
  return (progress, from) => {
    // The circle starts at angle 0, so its center is one radius to the left of the start.
    const center = { x: from.wrist.x - radius, y: from.wrist.y };
    const angle = (clockwise ? 1 : -1) * 2 * Math.PI * turns * progress;
    return { ...from, wrist: { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) } };
  };
}
