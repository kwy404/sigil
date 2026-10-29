import type { GestureKey } from './gestures';
import type { HandFrame } from './landmarks';
import { circlePath, renderPerformance, rigPose, type RenderOptions, type RigSegment, type RigShapeName } from './synthetic';

/** A sequence of tracker frames with the gestures it is expected to produce. */
export interface HandRecording {
  id: string;
  label: string;
  description: string;
  fps: number;
  frameAspect: number;
  /** Gesture keys expected in order. pinch_hold end events are not listed. */
  expected: GestureKey[];
  frames: HandFrame[];
}

interface SampleScript {
  id: string;
  label: string;
  description: string;
  expected: GestureKey[];
  shape: RigShapeName;
  wrist: { x: number; y: number };
  segments: RigSegment[];
  options?: RenderOptions;
}

/** Ids of the sample recordings, one per gesture of the vocabulary, in the order they are shown. */
export const SAMPLE_IDS = [
  'open-palm',
  'point',
  'fist',
  'pinch',
  'double-pinch',
  'pinch-hold',
  'swipe-two-right',
  'swipe-three-up',
  'circle-cw',
  'circle-ccw',
  'flick-up',
] as const;

export type SampleId = (typeof SAMPLE_IDS)[number];

export function isSampleId(id: string): id is SampleId {
  return (SAMPLE_IDS as readonly string[]).includes(id);
}

const CENTER = { x: 0.5, y: 0.62 };

const SCRIPTS: (SampleScript & { id: SampleId })[] = [
  {
    id: 'open-palm',
    label: 'Open palm',
    description: 'An open hand held still for 0.8 s.',
    expected: ['open_palm'],
    shape: 'open_palm',
    wrist: CENTER,
    segments: [{ hold: 800 }],
  },
  {
    id: 'point',
    label: 'Point',
    description: 'Index finger raised, other fingers folded.',
    expected: ['point'],
    shape: 'point',
    wrist: CENTER,
    segments: [{ hold: 700 }],
  },
  {
    id: 'fist',
    label: 'Fist',
    description: 'A closed fist held for 0.7 s.',
    expected: ['fist'],
    shape: 'fist',
    wrist: CENTER,
    segments: [{ hold: 700 }],
  },
  {
    id: 'pinch',
    label: 'Pinch',
    description: 'Point, then a quick touch of thumb and index.',
    expected: ['point', 'pinch'],
    shape: 'point',
    wrist: CENTER,
    segments: [
      { hold: 400 },
      { to: { shape: 'pinch' }, over: 70 },
      { hold: 130 },
      { to: { shape: 'point' }, over: 70 },
      { hold: 600 },
    ],
  },
  {
    id: 'double-pinch',
    label: 'Double pinch',
    description: 'Two quick pinches in a row.',
    expected: ['point', 'double_pinch'],
    shape: 'point',
    wrist: CENTER,
    segments: [
      { hold: 400 },
      { to: { shape: 'pinch' }, over: 60 },
      { hold: 100 },
      { to: { shape: 'point' }, over: 60 },
      { hold: 120 },
      { to: { shape: 'pinch' }, over: 60 },
      { hold: 100 },
      { to: { shape: 'point' }, over: 60 },
      { hold: 600 },
    ],
  },
  {
    id: 'pinch-hold',
    label: 'Pinch and hold',
    description: 'A pinch held for 0.9 s, then released.',
    expected: ['point', 'pinch_hold'],
    shape: 'point',
    wrist: CENTER,
    segments: [
      { hold: 400 },
      { to: { shape: 'pinch' }, over: 70 },
      { hold: 900 },
      { to: { shape: 'point' }, over: 70 },
      { hold: 400 },
    ],
  },
  {
    id: 'swipe-two-right',
    label: 'Two finger swipe right',
    description: 'Index and middle raised, the hand sweeps to the right.',
    expected: ['swipe_two_right'],
    shape: 'two_fingers',
    wrist: { x: 0.32, y: 0.62 },
    segments: [{ hold: 350 }, { to: { wrist: { x: 0.68, y: 0.62 } }, over: 260 }, { hold: 400 }],
  },
  {
    id: 'swipe-three-up',
    label: 'Three finger swipe up',
    description: 'Three fingers raised, the hand sweeps upward.',
    expected: ['swipe_three_up'],
    shape: 'three_fingers',
    wrist: { x: 0.5, y: 0.8 },
    segments: [{ hold: 350 }, { to: { wrist: { x: 0.5, y: 0.5 } }, over: 260 }, { hold: 400 }],
  },
  {
    id: 'circle-cw',
    label: 'Circle clockwise',
    description: 'The fingertip draws one clockwise circle.',
    expected: ['point', 'circle_cw'],
    shape: 'point',
    wrist: { x: 0.6, y: 0.62 },
    segments: [{ hold: 400 }, { path: circlePath(0.1, true), over: 1100 }, { hold: 300 }],
  },
  {
    id: 'circle-ccw',
    label: 'Circle counterclockwise',
    description: 'The fingertip draws one counterclockwise circle.',
    expected: ['point', 'circle_ccw'],
    shape: 'point',
    wrist: { x: 0.6, y: 0.62 },
    segments: [{ hold: 400 }, { path: circlePath(0.1, false), over: 1100 }, { hold: 300 }],
  },
  {
    id: 'flick-up',
    label: 'Flick up',
    description: 'A short, fast upward flick of the pointing hand.',
    expected: ['point', 'flick_up'],
    shape: 'point',
    wrist: { x: 0.5, y: 0.66 },
    segments: [{ hold: 450 }, { to: { wrist: { x: 0.5, y: 0.44 } }, over: 110, easing: 'linear' }, { hold: 400 }],
  },
];

/** Sequences that must not produce any motion gesture. Used by the tests. */
const NEGATIVE_SCRIPTS: SampleScript[] = [
  {
    id: 'idle-jitter',
    label: 'Idle jitter',
    description: 'A pointing hand with strong tracker noise and a slow drift.',
    expected: ['point'],
    shape: 'point',
    wrist: CENTER,
    segments: [{ to: { wrist: { x: 0.55, y: 0.6 } }, over: 2000, easing: 'linear' }],
    options: { noise: 0.004, seed: 7 },
  },
  {
    id: 'slow-drag',
    label: 'Slow two finger drag',
    description: 'Two fingers moving slowly, too slow for a swipe.',
    expected: [],
    shape: 'two_fingers',
    wrist: { x: 0.35, y: 0.62 },
    segments: [{ hold: 200 }, { to: { wrist: { x: 0.65, y: 0.62 } }, over: 1500, easing: 'linear' }, { hold: 200 }],
  },
  {
    id: 'fist-then-open',
    label: 'Fist, then open palm',
    description: 'A fist that opens into a palm.',
    expected: ['fist', 'open_palm'],
    shape: 'fist',
    wrist: CENTER,
    segments: [{ hold: 600 }, { to: { shape: 'open_palm' }, over: 120 }, { hold: 700 }],
  },
  {
    id: 'brief-hand',
    label: 'Brief hand',
    description: 'A hand that appears for 150 ms and leaves.',
    expected: [],
    shape: 'open_palm',
    wrist: CENTER,
    segments: [{ hold: 150 }, { hide: 400 }],
  },
  {
    id: 'portrait-pinch',
    label: 'Pinch on a portrait frame',
    description: 'The pinch sample rendered on a 3:4 portrait frame.',
    expected: ['point', 'pinch'],
    shape: 'point',
    wrist: CENTER,
    segments: [
      { hold: 400 },
      { to: { shape: 'pinch' }, over: 70 },
      { hold: 130 },
      { to: { shape: 'point' }, over: 70 },
      { hold: 600 },
    ],
    options: { aspect: 0.75, seed: 11 },
  },
];

/** Overrides used to render the same scripts under other conditions. */
export interface SampleVariant {
  seed?: number;
  /** Landmark noise standard deviation, in normalized units. */
  noise?: number;
  fps?: number;
}

function render(script: SampleScript, index: number, variant: SampleVariant = {}): HandRecording {
  const options: RenderOptions = {
    seed: (variant.seed ?? 100) + index,
    ...script.options,
    ...(variant.noise !== undefined ? { noise: variant.noise } : {}),
    ...(variant.fps !== undefined ? { fps: variant.fps } : {}),
  };
  return {
    id: script.id,
    label: script.label,
    description: script.description,
    fps: options.fps ?? 30,
    frameAspect: options.aspect ?? 1,
    expected: script.expected,
    frames: renderPerformance(rigPose(script.shape, script.wrist), script.segments, options),
  };
}

let cachedSamples: HandRecording[] | null = null;
let cachedNegatives: HandRecording[] | null = null;

/**
 * Sample recordings, one per gesture of the vocabulary, generated by the hand
 * rig. Without a variant the result is cached.
 */
export function sampleRecordings(variant?: SampleVariant): HandRecording[] {
  if (variant) {
    return SCRIPTS.map((script, i) => render(script, i, variant));
  }
  cachedSamples ??= SCRIPTS.map((script, i) => render(script, i));
  return cachedSamples;
}

/** Recordings that check for false positives. */
export function negativeRecordings(variant?: SampleVariant): HandRecording[] {
  if (variant) {
    return NEGATIVE_SCRIPTS.map((script, i) => render(script, 50 + i, variant));
  }
  cachedNegatives ??= NEGATIVE_SCRIPTS.map((script, i) => render(script, 50 + i));
  return cachedNegatives;
}
