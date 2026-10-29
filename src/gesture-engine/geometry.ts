import type { Landmark, Vec2 } from './landmarks';

export function distance3(a: Landmark, b: Landmark): number {
  'worklet';
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distance2(a: Vec2, b: Vec2): number {
  'worklet';
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Angle in radians between the vectors a to b and b to c, 0 when the three points are collinear. */
export function bendAngle(a: Landmark, b: Landmark, c: Landmark): number {
  'worklet';
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const vz = c.z - b.z;
  const lu = Math.sqrt(ux * ux + uy * uy + uz * uz);
  const lv = Math.sqrt(vx * vx + vy * vy + vz * vz);
  if (lu === 0 || lv === 0) {
    return 0;
  }
  const cos = (ux * vx + uy * vy + uz * vz) / (lu * lv);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** Wraps an angle to the range (-PI, PI]. */
export function wrapAngle(angle: number): number {
  'worklet';
  let a = angle;
  while (a > Math.PI) {
    a -= 2 * Math.PI;
  }
  while (a <= -Math.PI) {
    a += 2 * Math.PI;
  }
  return a;
}

export function clamp(value: number, min: number, max: number): number {
  'worklet';
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  'worklet';
  return a + (b - a) * t;
}
