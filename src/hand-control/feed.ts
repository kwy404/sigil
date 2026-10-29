import { useEffect, useState } from 'react';

import type { GestureEvent } from '../gesture-engine/gestures';
import type { Vec2 } from '../gesture-engine/landmarks';

/** A gesture from the live camera, with the cursor in screen pixels when it happened. */
export interface LiveGesture {
  event: GestureEvent;
  cursor: Vec2 | null;
}

type Listener = (gesture: LiveGesture) => void;

/** Frames count as live tracking for this long after the last one. */
const LIVE_MS = 1500;

const listeners = new Set<Listener>();
let lastFrameAt = 0;
let cursor: Vec2 | null = null;
let practice = 0;

/** The hand control reports each frame here, with the cursor in screen pixels. */
export function publishFrame(at: number, position: Vec2 | null): void {
  lastFrameAt = at;
  cursor = position;
}

/** The hand control reports each gesture here, before or instead of acting on it. */
export function publishGesture(gesture: LiveGesture): void {
  listeners.forEach((listener) => listener(gesture));
}

export function subscribeGestures(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True while frames from the camera keep arriving. */
export function liveTracking(now = Date.now()): boolean {
  return lastFrameAt > 0 && now - lastFrameAt < LIVE_MS;
}

export function liveCursor(): Vec2 | null {
  return cursor;
}

/**
 * While a practice screen is open, gestures only go to it: a pinch does not
 * tap, an open palm does not open the sphere and a fist does not start
 * listening. Returns the function that ends practice mode.
 */
export function beginPractice(): () => void {
  practice++;
  let ended = false;
  return () => {
    if (!ended) {
      ended = true;
      practice--;
    }
  };
}

export function inPractice(): boolean {
  return practice > 0;
}

/** Live tracking state for screens, checked twice a second. */
export function useLiveTracking(): boolean {
  const [live, setLive] = useState(() => liveTracking());
  useEffect(() => {
    const timer = setInterval(() => setLive(liveTracking()), 500);
    return () => clearInterval(timer);
  }, []);
  return live;
}
