import { HAND_LANDMARK_COUNT, type Landmark } from './landmarks';

/**
 * One Euro filter (Casiez, Roussel and Vogel, CHI 2012): an adaptive low pass
 * filter that removes jitter when the hand is still and keeps lag low when it
 * moves fast.
 */
export interface OneEuroParams {
  /** Minimum cutoff frequency in Hz. Lower values remove more jitter at rest. */
  minCutoff: number;
  /** Speed coefficient. Higher values reduce lag during fast motion. */
  beta: number;
  /** Cutoff frequency in Hz used to smooth the derivative. */
  dCutoff: number;
}

/** Defaults tuned for normalized hand landmark coordinates at 24 to 60 fps. */
export const DEFAULT_ONE_EURO: OneEuroParams = {
  minCutoff: 1.5,
  beta: 10,
  dCutoff: 1,
};

export interface OneEuroState {
  initialized: boolean;
  value: number;
  derivative: number;
  t: number;
}

export function createOneEuroState(): OneEuroState {
  'worklet';
  return { initialized: false, value: 0, derivative: 0, t: 0 };
}

/** Smoothing factor of an exponential filter with the given cutoff and time step. */
export function smoothingFactor(cutoffHz: number, dtSeconds: number): number {
  'worklet';
  const tau = 1 / (2 * Math.PI * cutoffHz);
  return 1 / (1 + tau / dtSeconds);
}

/**
 * Filters one sample and updates the state in place.
 * Timestamps are in milliseconds. A sample that is not newer than the previous
 * one returns the previous output unchanged.
 */
export function oneEuroNext(state: OneEuroState, value: number, tMs: number, params: OneEuroParams): number {
  'worklet';
  if (!state.initialized) {
    state.initialized = true;
    state.value = value;
    state.derivative = 0;
    state.t = tMs;
    return value;
  }
  const dt = (tMs - state.t) / 1000;
  if (!(dt > 0)) {
    return state.value;
  }
  const rawDerivative = (value - state.value) / dt;
  const derivativeAlpha = smoothingFactor(params.dCutoff, dt);
  const derivative = derivativeAlpha * rawDerivative + (1 - derivativeAlpha) * state.derivative;
  const cutoff = params.minCutoff + params.beta * Math.abs(derivative);
  const alpha = smoothingFactor(cutoff, dt);
  const filtered = alpha * value + (1 - alpha) * state.value;
  state.value = filtered;
  state.derivative = derivative;
  state.t = tMs;
  return filtered;
}

/** Convenience wrapper for code that runs on the JavaScript thread. */
export class OneEuroFilter {
  private state: OneEuroState = createOneEuroState();

  constructor(private readonly params: OneEuroParams = DEFAULT_ONE_EURO) {}

  filter(value: number, tMs: number): number {
    return oneEuroNext(this.state, value, tMs, this.params);
  }

  reset(): void {
    this.state = createOneEuroState();
  }
}

/** One filter per coordinate of the 21 landmarks. */
export interface LandmarkFilterState {
  channels: OneEuroState[];
}

export function createLandmarkFilterState(): LandmarkFilterState {
  'worklet';
  const channels: OneEuroState[] = [];
  for (let i = 0; i < HAND_LANDMARK_COUNT * 3; i++) {
    channels.push(createOneEuroState());
  }
  return { channels };
}

export function resetLandmarkFilter(state: LandmarkFilterState): void {
  'worklet';
  for (let i = 0; i < state.channels.length; i++) {
    state.channels[i].initialized = false;
  }
}

export function filterLandmarks(
  state: LandmarkFilterState,
  landmarks: readonly Landmark[],
  tMs: number,
  params: OneEuroParams,
): Landmark[] {
  'worklet';
  const out: Landmark[] = [];
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    out.push({
      x: oneEuroNext(state.channels[i * 3], p.x, tMs, params),
      y: oneEuroNext(state.channels[i * 3 + 1], p.y, tMs, params),
      z: oneEuroNext(state.channels[i * 3 + 2], p.z, tMs, params),
    });
  }
  return out;
}
