import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { flattenLandmarks, sampleRecordings, type HandRecording } from '../../gesture-engine';
import { HandControl, type HandControlNative, type NativeHandFrame } from '../controller';
import { beginPractice, subscribeGestures } from '../feed';

const profiles = ProfileRegistry.withBuiltins();

function recording(id: string): HandRecording {
  const found = sampleRecordings().find((sample) => sample.id === id);
  if (!found) throw new Error(id);
  return found;
}

/** The recording as the native module sends it: flat landmarks, empty when the hand is lost. */
function nativeFrames(sample: HandRecording): NativeHandFrame[] {
  return sample.frames.map((frame) => ({
    t: frame.t,
    landmarks: frame.landmarks ? flattenLandmarks(frame.landmarks) : [],
    score: frame.score ?? 1,
    handedness: null,
    aspect: sample.frameAspect,
  }));
}

function fakeNative(log: string[]): HandControlNative {
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      log.push(`${name} ${args.map((a) => (typeof a === 'number' ? Math.round(a) : String(a))).join(' ')}`.trim());
      return true;
    };
  return {
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
    moveCursor: () => undefined,
    hideCursor: () => log.push('hideCursor'),
    showCursor: () => {
      log.push('showCursor');
      return true;
    },
  };
}

function control(log: string[], voiceGesture?: (kind: 'pinch' | 'fist') => boolean) {
  const ui = {
    sphere: (action: string) => log.push(`sphere ${action}`),
    listen: () => log.push('listen'),
    cursor: (action: string) => log.push(`cursor ${action}`),
    pause: () => log.push('pause'),
    needsAccess: (access: string) => log.push(`needsAccess ${access}`),
  };
  return new HandControl({
    native: fakeNative(log),
    profiles,
    ui,
    screen: { width: 1080, height: 2400 },
    foreground: () => 'com.example.app',
    voiceGesture,
  });
}

describe('HandControl', () => {
  it('taps where the cursor is when the hand pinches', () => {
    const log: string[] = [];
    const hands = control(log);
    const events = nativeFrames(recording('pinch')).flatMap((frame) => hands.push(frame));
    expect(events.map((event) => event.kind)).toEqual(['point', 'pinch']);
    const taps = log.filter((entry) => entry.startsWith('tap'));
    expect(taps).toHaveLength(1);
    const [, x, y] = taps[0].split(' ').map(Number);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(1080);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(2400);
    expect(log[0]).toBe('showCursor');
  });

  it('opens the sphere with an open palm and listens on a fist', () => {
    const log: string[] = [];
    const hands = control(log);
    const palm = nativeFrames(recording('open-palm'));
    palm.forEach((frame) => hands.push(frame));
    // The second recording continues in time after the first.
    const offset = palm[palm.length - 1].t + 500;
    nativeFrames(recording('fist')).forEach((frame) => hands.push({ ...frame, t: frame.t + offset }));
    expect(log).toContain('sphere toggle');
    expect(log).toContain('listen');
  });

  it('gives a pinch to an open voice question instead of tapping', () => {
    const log: string[] = [];
    const used: string[] = [];
    const hands = control(log, (kind) => {
      used.push(kind);
      return true;
    });
    nativeFrames(recording('pinch')).forEach((frame) => hands.push(frame));
    expect(used).toEqual(['pinch']);
    expect(log.some((entry) => entry.startsWith('tap'))).toBe(false);
  });

  it('only reports gestures while a practice screen is open', () => {
    const log: string[] = [];
    const seen: string[] = [];
    const hands = control(log);
    const unsubscribe = subscribeGestures(({ event }) => seen.push(event.kind));
    const end = beginPractice();
    nativeFrames(recording('pinch')).forEach((frame) => hands.push(frame));
    end();
    unsubscribe();
    expect(seen).toEqual(['point', 'pinch']);
    expect(log.some((entry) => entry.startsWith('tap'))).toBe(false);
  });

  it('moves the cursor but never acts on frames from the demo hand', () => {
    const log: string[] = [];
    const moves: number[] = [];
    const hands = control(log);
    const native = (hands as unknown as { options: { native: HandControlNative } }).options.native;
    native.moveCursor = () => moves.push(1);
    nativeFrames(recording('pinch')).forEach((frame) => hands.push({ ...frame, synthetic: true }));
    expect(moves.length).toBeGreaterThan(10);
    expect(log.some((entry) => entry.startsWith('tap'))).toBe(false);
  });

  it('ignores gestures while paused', () => {
    const log: string[] = [];
    const hands = control(log);
    hands.togglePause();
    nativeFrames(recording('pinch')).forEach((frame) => hands.push(frame));
    expect(log.some((entry) => entry.startsWith('tap'))).toBe(false);
  });
});

describe('HandControl in a real room', () => {
  /** A second, small hand far behind the user, in every frame. */
  function withBackground(frames: NativeHandFrame[]): NativeHandFrame[] {
    const small = flattenLandmarks(recording('open-palm').frames.find((frame) => frame.landmarks)?.landmarks ?? []).map((value, index) =>
      index % 3 === 2 ? value : 0.85 + (value - 0.5) * 0.15,
    );
    return frames.map((frame) => ({
      ...frame,
      hands: frame.landmarks.length > 0 ? [{ landmarks: small, score: 0.9, handedness: 'left' }, { landmarks: frame.landmarks, score: 1, handedness: 'right' }] : [],
    }));
  }

  it('follows the user and still taps when someone else is in the background', () => {
    const log: string[] = [];
    const hands = control(log);
    withBackground(nativeFrames(recording('pinch'))).forEach((frame) => hands.push(frame));
    expect(log.filter((entry) => entry.startsWith('tap'))).toHaveLength(1);
  });

  it('moves the cursor but does not act while it is too dark, and says so', () => {
    const log: string[] = [];
    const hands = control(log);
    const frames = nativeFrames(recording('pinch'));
    frames.forEach((frame) => hands.push({ ...frame, brightness: 12 }));
    expect(hands.condition.dark).toBe(true);
    expect(log.some((entry) => entry.startsWith('tap'))).toBe(false);
  });

  it('fades the cursor where the hand was lost, then hides it', () => {
    const states: string[] = [];
    const log: string[] = [];
    const hands = control(log);
    const native = (hands as unknown as { options: { native: HandControlNative } }).options.native;
    native.moveCursor = (_x, _y, state) => states.push(state);
    const frames = nativeFrames(recording('pinch'));
    frames.forEach((frame) => hands.push(frame));
    const end = frames[frames.length - 1].t;
    hands.push({ t: end + 50, landmarks: [], score: 0, handedness: null });
    expect(states[states.length - 1]).toBe('lost');
    hands.push({ t: end + 2000, landmarks: [], score: 0, handedness: null });
    expect(log[log.length - 1]).toBe('hideCursor');
  });

  it('reports a hand cut off by the edge as ignored', () => {
    const log: string[] = [];
    const hands = control(log);
    const frame = nativeFrames(recording('open-palm')).find((candidate) => candidate.landmarks.length > 0) as NativeHandFrame;
    const shifted = frame.landmarks.map((value, index) => (index % 3 === 0 ? value + 0.6 : value));
    hands.push({ ...frame, landmarks: shifted });
    expect(hands.condition.hand).toBe('ignored');
    expect(hands.condition.ignored).toBe('cut_off');
  });
});

describe('HandControl with the native cursor', () => {
  it('leaves the cursor to native code and taps where the native cursor is', () => {
    const log: string[] = [];
    const moves: number[] = [];
    const hands = control(log);
    const native = (hands as unknown as { options: { native: HandControlNative } }).options.native;
    native.moveCursor = () => moves.push(1);
    nativeFrames(recording('pinch')).forEach((frame) => hands.push({ ...frame, nativeCursor: true, cursorX: 321, cursorY: 654 }));
    expect(moves).toHaveLength(0);
    expect(log.filter((entry) => entry.startsWith('tap'))).toEqual(['tap 321 654']);
  });
});
