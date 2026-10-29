import { describe, expect, it } from '@jest/globals';

import {
  createLandmarkFilterState,
  DEFAULT_ONE_EURO,
  filterLandmarks,
  OneEuroFilter,
  resetLandmarkFilter,
  rigLandmarks,
  rigPose,
  seededRandom,
} from '..';

function standardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length);
}

function noisyConstant(count: number, sigma: number, seed: number): number[] {
  const random = seededRandom(seed);
  return Array.from({ length: count }, () => 0.5 + (random() - 0.5) * 2 * sigma * Math.sqrt(3));
}

describe('OneEuroFilter', () => {
  it('passes the first sample through', () => {
    const filter = new OneEuroFilter();
    expect(filter.filter(0.42, 0)).toBe(0.42);
  });

  it('keeps a constant signal constant', () => {
    const filter = new OneEuroFilter();
    for (let i = 0; i < 60; i++) {
      expect(filter.filter(0.3, i * 33)).toBeCloseTo(0.3, 12);
    }
  });

  it('removes most of the jitter of a still hand', () => {
    const input = noisyConstant(300, 0.004, 3);
    const filter = new OneEuroFilter();
    const output = input.map((v, i) => filter.filter(v, i * 33.3));
    // Skip the first samples while the filter settles.
    const inputSd = standardDeviation(input.slice(30));
    const outputSd = standardDeviation(output.slice(30));
    expect(outputSd).toBeLessThan(inputSd * 0.5);
  });

  it('lags less on fast motion when beta is higher', () => {
    const run = (beta: number) => {
      const filter = new OneEuroFilter({ ...DEFAULT_ONE_EURO, beta });
      let last = 0;
      // A ramp of 1.5 frame widths per second, sampled at 30 fps.
      for (let i = 0; i <= 15; i++) {
        last = filter.filter(i * 0.05, i * 33.3);
      }
      return 0.75 - last;
    };
    const lagWithoutSpeedTerm = run(0);
    const lagWithSpeedTerm = run(DEFAULT_ONE_EURO.beta);
    expect(lagWithSpeedTerm).toBeGreaterThanOrEqual(0);
    expect(lagWithSpeedTerm).toBeLessThan(lagWithoutSpeedTerm / 3);
  });

  it('ignores samples that are not newer than the previous one', () => {
    const filter = new OneEuroFilter();
    filter.filter(0.1, 100);
    const settled = filter.filter(0.2, 133);
    expect(filter.filter(0.9, 133)).toBe(settled);
    expect(filter.filter(0.9, 120)).toBe(settled);
  });

  it('starts over after reset', () => {
    const filter = new OneEuroFilter();
    filter.filter(0.1, 0);
    filter.filter(0.1, 33);
    filter.reset();
    expect(filter.filter(0.8, 66)).toBe(0.8);
  });
});

describe('landmark filter', () => {
  it('filters all 63 coordinates and keeps the hand shape at rest', () => {
    const landmarks = rigLandmarks(rigPose('open_palm', { x: 0.5, y: 0.6 }));
    const state = createLandmarkFilterState();
    expect(state.channels).toHaveLength(63);
    let out = filterLandmarks(state, landmarks, 0, DEFAULT_ONE_EURO);
    for (let i = 1; i < 10; i++) {
      out = filterLandmarks(state, landmarks, i * 33, DEFAULT_ONE_EURO);
    }
    out.forEach((p, i) => {
      expect(p.x).toBeCloseTo(landmarks[i].x, 10);
      expect(p.y).toBeCloseTo(landmarks[i].y, 10);
      expect(p.z).toBeCloseTo(landmarks[i].z, 10);
    });
  });

  it('jumps to a new position after reset instead of easing toward it', () => {
    const state = createLandmarkFilterState();
    const a = rigLandmarks(rigPose('point', { x: 0.3, y: 0.6 }));
    const b = rigLandmarks(rigPose('point', { x: 0.7, y: 0.6 }));
    filterLandmarks(state, a, 0, DEFAULT_ONE_EURO);
    resetLandmarkFilter(state);
    const out = filterLandmarks(state, b, 33, DEFAULT_ONE_EURO);
    expect(out[0].x).toBe(b[0].x);
  });
});
