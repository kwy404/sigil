import { describe, expect, it } from '@jest/globals';

import {
  classifyPose,
  computeFeatures,
  createPoseTracker,
  DEFAULT_FEATURE_THRESHOLDS,
  DEFAULT_PINCH_THRESHOLDS,
  DEFAULT_POSE_STABILIZER,
  rigLandmarks,
  rigPose,
  toIsotropic,
  updatePose,
  type HandPose,
  type RigShapeName,
} from '..';

const SHAPES: [RigShapeName, HandPose][] = [
  ['open_palm', 'open_palm'],
  ['point', 'point'],
  ['fist', 'fist'],
  ['two_fingers', 'two_fingers'],
  ['three_fingers', 'three_fingers'],
  ['pinch', 'pinch'],
];

function poseOf(shape: RigShapeName, options: { scale?: number; roll?: number; aspect?: number } = {}): HandPose {
  const aspect = options.aspect ?? 1;
  const landmarks = rigLandmarks(rigPose(shape, { x: 0.5, y: 0.6 }, options.scale, options.roll), aspect);
  const features = computeFeatures(toIsotropic(landmarks, aspect), DEFAULT_FEATURE_THRESHOLDS);
  return classifyPose(features, false, DEFAULT_PINCH_THRESHOLDS);
}

describe('hand features', () => {
  it('reports every finger extended on an open palm', () => {
    const landmarks = rigLandmarks(rigPose('open_palm', { x: 0.5, y: 0.6 }));
    const features = computeFeatures(landmarks, DEFAULT_FEATURE_THRESHOLDS);
    expect(features.fingers).toEqual({
      thumb: 'extended',
      index: 'extended',
      middle: 'extended',
      ring: 'extended',
      pinky: 'extended',
    });
    expect(features.palmSize).toBeCloseTo(0.16, 6);
    expect(features.pinchDistance).toBeGreaterThan(0.8);
  });

  it('reports every finger curled on a fist', () => {
    const features = computeFeatures(rigLandmarks(rigPose('fist', { x: 0.5, y: 0.6 })), DEFAULT_FEATURE_THRESHOLDS);
    expect(features.fingers.index).toBe('curled');
    expect(features.fingers.middle).toBe('curled');
    expect(features.fingers.ring).toBe('curled');
    expect(features.fingers.pinky).toBe('curled');
  });

  it('measures the pinch distance in palm sizes', () => {
    const features = computeFeatures(rigLandmarks(rigPose('pinch', { x: 0.5, y: 0.6 })), DEFAULT_FEATURE_THRESHOLDS);
    expect(features.pinchDistance).toBeLessThan(0.1);
    expect(features.pinchPoint.y).toBeLessThan(0.6);
  });

  it('keeps a finger in its previous state inside the hysteresis band', () => {
    const landmarks = rigLandmarks({ ...rigPose('point', { x: 0.5, y: 0.6 }), curl: { thumb: 0.8, index: 0.25, middle: 1, ring: 1, pinky: 1 } });
    const fresh = computeFeatures(landmarks, DEFAULT_FEATURE_THRESHOLDS);
    const remembered = computeFeatures(landmarks, DEFAULT_FEATURE_THRESHOLDS, { ...fresh.fingers, index: 'extended' });
    expect(fresh.bend.index).toBeGreaterThan(DEFAULT_FEATURE_THRESHOLDS.extendedMaxBend);
    expect(fresh.fingers.index).toBe('partial');
    expect(remembered.fingers.index).toBe('extended');
  });
});

describe('classifyPose', () => {
  it.each(SHAPES)('recognizes %s', (shape, expected) => {
    expect(poseOf(shape)).toBe(expected);
  });

  it.each(SHAPES)('recognizes %s when the hand is rotated or far away', (shape, expected) => {
    expect(poseOf(shape, { roll: 0.6 })).toBe(expected);
    expect(poseOf(shape, { roll: -0.6 })).toBe(expected);
    expect(poseOf(shape, { scale: 0.07 })).toBe(expected);
    expect(poseOf(shape, { scale: 0.3 })).toBe(expected);
  });

  it.each(SHAPES)('recognizes %s on a portrait frame', (shape, expected) => {
    expect(poseOf(shape, { aspect: 0.75 })).toBe(expected);
  });

  it('does not take a half bent index for a fist', () => {
    const landmarks = rigLandmarks({
      ...rigPose('fist', { x: 0.5, y: 0.6 }),
      curl: { thumb: 0.3, index: 0.3, middle: 1, ring: 1, pinky: 1 },
    });
    const features = computeFeatures(landmarks, DEFAULT_FEATURE_THRESHOLDS);
    expect(classifyPose(features, false, DEFAULT_PINCH_THRESHOLDS)).not.toBe('fist');
  });

  it('applies hysteresis to the pinch threshold', () => {
    const featuresAt = (pinch: number) =>
      computeFeatures(rigLandmarks({ ...rigPose('point', { x: 0.5, y: 0.6 }), pinch }), DEFAULT_FEATURE_THRESHOLDS);
    // Close the fingers until the distance sits between the enter and release thresholds.
    let pinch = 0.3;
    while (featuresAt(pinch).pinchDistance > (DEFAULT_PINCH_THRESHOLDS.enter + DEFAULT_PINCH_THRESHOLDS.release) / 2) {
      pinch += 0.01;
    }
    const features = featuresAt(pinch);
    expect(features.pinchDistance).toBeGreaterThan(DEFAULT_PINCH_THRESHOLDS.enter);
    expect(features.pinchDistance).toBeLessThan(DEFAULT_PINCH_THRESHOLDS.release);
    expect(classifyPose(features, false, DEFAULT_PINCH_THRESHOLDS)).not.toBe('pinch');
    expect(classifyPose(features, true, DEFAULT_PINCH_THRESHOLDS)).toBe('pinch');
  });
});

describe('pose stabilizer', () => {
  it('switches only after the new pose is seen on consecutive frames', () => {
    const state = createPoseTracker();
    expect(updatePose(state, 'point', 0, DEFAULT_POSE_STABILIZER)).toBe(false);
    expect(state.current).toBe('none');
    expect(updatePose(state, 'point', 33, DEFAULT_POSE_STABILIZER)).toBe(true);
    expect(state.current).toBe('point');
    expect(state.currentSince).toBe(0);
  });

  it('ignores a single frame of a different pose', () => {
    const state = createPoseTracker();
    updatePose(state, 'fist', 0, DEFAULT_POSE_STABILIZER);
    updatePose(state, 'fist', 33, DEFAULT_POSE_STABILIZER);
    updatePose(state, 'unknown', 66, DEFAULT_POSE_STABILIZER);
    updatePose(state, 'fist', 100, DEFAULT_POSE_STABILIZER);
    updatePose(state, 'unknown', 133, DEFAULT_POSE_STABILIZER);
    expect(state.current).toBe('fist');
  });

  it('drops to none as soon as the hand is lost', () => {
    const state = createPoseTracker();
    updatePose(state, 'open_palm', 0, DEFAULT_POSE_STABILIZER);
    updatePose(state, 'open_palm', 33, DEFAULT_POSE_STABILIZER);
    expect(updatePose(state, 'none', 66, DEFAULT_POSE_STABILIZER)).toBe(true);
    expect(state.current).toBe('none');
  });
});
