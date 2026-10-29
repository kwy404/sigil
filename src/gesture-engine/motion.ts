import type { Direction } from './gestures';
import { wrapAngle } from './geometry';
import type { HandPose } from './pose';

/** One sample of a tracked point, in isotropic units (see toIsotropic). */
export interface TrackPoint {
  t: number;
  x: number;
  y: number;
  /** Pose observed in this frame, before stabilization. */
  pose: HandPose;
}

export interface SwipeConfig {
  /** How far back to look for the start of the swipe, in milliseconds. */
  windowMs: number;
  /** Minimum travel in frame widths. */
  minDistance: number;
  /** Travel along the main axis must be this many times the travel across it. */
  minAxisRatio: number;
  /** Share of samples in the window that must show the swipe pose. */
  minPoseRatio: number;
  /** Path length divided by displacement must stay below this. */
  maxStraightness: number;
}

export interface CircleConfig {
  /** Candidate window lengths in milliseconds, shortest first. */
  windowsMs: number[];
  /** Minimum accumulated rotation in turns. */
  minTurns: number;
  /** Minimum mean radius in frame widths. */
  minRadius: number;
  /** Maximum coefficient of variation of the radius. */
  maxRadiusVariation: number;
  /** A single step may not rotate more than this many radians around the center. */
  maxStepAngle: number;
  /** Minimum number of samples in a window. */
  minPoints: number;
  /** Share of samples that must show the point pose. */
  minPoseRatio: number;
}

export interface FlickConfig {
  windowMs: number;
  minDistance: number;
  /** Minimum peak speed between two samples, in frame widths per second. */
  minPeakSpeed: number;
  minAxisRatio: number;
  minPoseRatio: number;
  maxStraightness: number;
}

export const DEFAULT_SWIPE: SwipeConfig = {
  windowMs: 420,
  minDistance: 0.2,
  minAxisRatio: 1.8,
  minPoseRatio: 0.6,
  maxStraightness: 1.3,
};

export const DEFAULT_CIRCLE: CircleConfig = {
  windowsMs: [700, 1000, 1300, 1700],
  minTurns: 0.8,
  minRadius: 0.035,
  maxRadiusVariation: 0.45,
  maxStepAngle: 1.0,
  minPoints: 12,
  minPoseRatio: 0.75,
};

export const DEFAULT_FLICK: FlickConfig = {
  windowMs: 170,
  minDistance: 0.14,
  minPeakSpeed: 1.6,
  minAxisRatio: 1.6,
  minPoseRatio: 0.6,
  maxStraightness: 1.15,
};

export function pushTrackPoint(track: TrackPoint[], point: TrackPoint, maxAgeMs: number): void {
  'worklet';
  track.push(point);
  const oldest = point.t - maxAgeMs;
  let drop = 0;
  while (drop < track.length && track[drop].t < oldest) {
    drop++;
  }
  if (drop > 0) {
    track.splice(0, drop);
  }
}

/** Index of the first sample at or after time t. */
function firstIndexAtOrAfter(track: readonly TrackPoint[], t: number): number {
  'worklet';
  for (let i = 0; i < track.length; i++) {
    if (track[i].t >= t) {
      return i;
    }
  }
  return track.length;
}

function poseRatio(track: readonly TrackPoint[], from: number, poses: readonly HandPose[]): number {
  'worklet';
  const count = track.length - from;
  if (count <= 0) {
    return 0;
  }
  let matching = 0;
  for (let i = from; i < track.length; i++) {
    if (poses.indexOf(track[i].pose) >= 0) {
      matching++;
    }
  }
  return matching / count;
}

function pathLength(track: readonly TrackPoint[], from: number): number {
  'worklet';
  let length = 0;
  for (let i = from + 1; i < track.length; i++) {
    const dx = track[i].x - track[i - 1].x;
    const dy = track[i].y - track[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

/** Direction of a displacement when one axis clearly dominates, in screen space (y down). */
export function dominantDirection(dx: number, dy: number, minAxisRatio: number): Direction | null {
  'worklet';
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= ay * minAxisRatio && ax > 0) {
    return dx > 0 ? 'right' : 'left';
  }
  if (ay >= ax * minAxisRatio && ay > 0) {
    return dy > 0 ? 'down' : 'up';
  }
  return null;
}

export interface LinearMotion {
  direction: Direction;
  distance: number;
  durationMs: number;
}

function detectLinear(
  track: readonly TrackPoint[],
  now: number,
  windowMs: number,
  minDistance: number,
  minAxisRatio: number,
  maxStraightness: number,
): LinearMotion | null {
  'worklet';
  const from = firstIndexAtOrAfter(track, now - windowMs);
  if (track.length - from < 3) {
    return null;
  }
  const start = track[from];
  const end = track[track.length - 1];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < minDistance) {
    return null;
  }
  if (pathLength(track, from) / distance > maxStraightness) {
    return null;
  }
  const direction = dominantDirection(dx, dy, minAxisRatio);
  if (direction === null) {
    return null;
  }
  return { direction, distance, durationMs: end.t - start.t };
}

/** Detects a fast swipe of the palm while the hand shows the given pose. */
export function detectSwipe(
  track: readonly TrackPoint[],
  now: number,
  pose: 'two_fingers' | 'three_fingers',
  config: SwipeConfig,
): LinearMotion | null {
  'worklet';
  const from = firstIndexAtOrAfter(track, now - config.windowMs);
  if (poseRatio(track, from, [pose]) < config.minPoseRatio) {
    return null;
  }
  return detectLinear(track, now, config.windowMs, config.minDistance, config.minAxisRatio, config.maxStraightness);
}

export interface FlickMotion extends LinearMotion {
  peakSpeed: number;
}

/** Detects a short, fast and straight movement of the index fingertip. */
export function detectFlick(track: readonly TrackPoint[], now: number, config: FlickConfig): FlickMotion | null {
  'worklet';
  const from = firstIndexAtOrAfter(track, now - config.windowMs);
  if (poseRatio(track, from, ['point']) < config.minPoseRatio) {
    return null;
  }
  const motion = detectLinear(track, now, config.windowMs, config.minDistance, config.minAxisRatio, config.maxStraightness);
  if (motion === null) {
    return null;
  }
  let peakSpeed = 0;
  for (let i = from + 1; i < track.length; i++) {
    const dt = (track[i].t - track[i - 1].t) / 1000;
    if (dt > 0) {
      const dx = track[i].x - track[i - 1].x;
      const dy = track[i].y - track[i - 1].y;
      peakSpeed = Math.max(peakSpeed, Math.sqrt(dx * dx + dy * dy) / dt);
    }
  }
  if (peakSpeed < config.minPeakSpeed) {
    return null;
  }
  return { direction: motion.direction, distance: motion.distance, durationMs: motion.durationMs, peakSpeed };
}

export interface CircleMotion {
  clockwise: boolean;
  turns: number;
  radius: number;
  durationMs: number;
}

/**
 * Detects a circle drawn with the index fingertip. Rotation is measured around
 * the center of the bounding box, which ignores pauses at the start of the
 * stroke. In screen space (y down) a positive rotation is clockwise.
 */
export function detectCircle(track: readonly TrackPoint[], now: number, config: CircleConfig): CircleMotion | null {
  'worklet';
  for (let w = 0; w < config.windowsMs.length; w++) {
    const from = firstIndexAtOrAfter(track, now - config.windowsMs[w]);
    const count = track.length - from;
    if (count < config.minPoints) {
      continue;
    }
    if (poseRatio(track, from, ['point']) < config.minPoseRatio) {
      continue;
    }
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = from; i < track.length; i++) {
      minX = Math.min(minX, track[i].x);
      maxX = Math.max(maxX, track[i].x);
      minY = Math.min(minY, track[i].y);
      maxY = Math.max(maxY, track[i].y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    if (width <= 0 || height <= 0 || width / height > 2 || height / width > 2) {
      continue;
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    let sumRadius = 0;
    for (let i = from; i < track.length; i++) {
      const dx = track[i].x - cx;
      const dy = track[i].y - cy;
      sumRadius += Math.sqrt(dx * dx + dy * dy);
    }
    const meanRadius = sumRadius / count;
    if (meanRadius < config.minRadius) {
      continue;
    }
    let variance = 0;
    for (let i = from; i < track.length; i++) {
      const dx = track[i].x - cx;
      const dy = track[i].y - cy;
      const r = Math.sqrt(dx * dx + dy * dy) - meanRadius;
      variance += r * r;
    }
    if (Math.sqrt(variance / count) / meanRadius > config.maxRadiusVariation) {
      continue;
    }

    let total = 0;
    let valid = true;
    let previous = Math.atan2(track[from].y - cy, track[from].x - cx);
    for (let i = from + 1; i < track.length; i++) {
      const angle = Math.atan2(track[i].y - cy, track[i].x - cx);
      const step = wrapAngle(angle - previous);
      if (Math.abs(step) > config.maxStepAngle) {
        valid = false;
        break;
      }
      total += step;
      previous = angle;
    }
    if (!valid) {
      continue;
    }
    const turns = Math.abs(total) / (2 * Math.PI);
    if (turns >= config.minTurns) {
      return {
        clockwise: total > 0,
        turns,
        radius: meanRadius,
        durationMs: track[track.length - 1].t - track[from].t,
      };
    }
  }
  return null;
}
