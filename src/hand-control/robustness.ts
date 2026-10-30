import type { Vec2 } from '../gesture-engine/landmarks';

/**
 * The decisions that keep live control honest in real rooms: which hand is
 * the user's, when it is steady enough to act on, when the light is too poor,
 * when gestures come too fast to be meant, and how the cursor behaves when the
 * hand is lost. All plain functions and small state machines, so each rule is
 * unit tested, also against landmarks MediaPipe returned for real photos.
 */

/** One hand as the tracker reports it: 21 landmarks as flat x, y, z triples in frame units (0 to 1). */
export interface HandCandidate {
  landmarks: readonly number[];
  score: number;
  handedness: 'left' | 'right' | null;
}

export interface SelectionConfig {
  /** Below this the tracker is unsure it is a hand at all. */
  minScore: number;
  /** Wrist to middle finger base, in frame widths: smaller hands are people in the background. */
  minPalm: number;
  /**
   * How far outside the frame a key point may lie. The index tip must stay
   * inside, and at most one other key point (wrist, thumb tip, middle finger
   * base) may leave: pointing low pushes the wrist out of a selfie frame.
   */
  edgeMargin: number;
}

export const DEFAULT_SELECTION: SelectionConfig = { minScore: 0.5, minPalm: 0.06, edgeMargin: 0.01 };

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_BASE = 9;
const KEY_POINTS = [WRIST, THUMB_TIP, INDEX_TIP, MIDDLE_BASE];

export type IgnoredReason = 'low_score' | 'too_small' | 'cut_off';

export interface HandQuality {
  /** Wrist to middle finger base in frame widths, with y scaled by the frame aspect. */
  palm: number;
  wrist: Vec2;
  /** Center of the four key points. */
  center: Vec2;
  inside: boolean;
}

function point(landmarks: readonly number[], index: number): Vec2 {
  return { x: landmarks[index * 3], y: landmarks[index * 3 + 1] };
}

/** Size, place and completeness of a hand; aspect is the frame width over its height. */
export function handQuality(landmarks: readonly number[], aspect: number, edgeMargin = DEFAULT_SELECTION.edgeMargin): HandQuality {
  const wrist = point(landmarks, WRIST);
  const base = point(landmarks, MIDDLE_BASE);
  const palm = Math.hypot(base.x - wrist.x, (base.y - wrist.y) / aspect);
  let outside = 0;
  let tipOutside = false;
  let cx = 0;
  let cy = 0;
  for (const index of KEY_POINTS) {
    const p = point(landmarks, index);
    cx += p.x / KEY_POINTS.length;
    cy += p.y / KEY_POINTS.length;
    if (p.x < -edgeMargin || p.x > 1 + edgeMargin || p.y < -edgeMargin || p.y > 1 + edgeMargin) {
      outside++;
      if (index === INDEX_TIP) tipOutside = true;
    }
  }
  return { palm, wrist, center: { x: cx, y: cy }, inside: !tipOutside && outside <= 1 };
}

/** Why a hand cannot be the user's, or null when it can. */
export function rejectHand(candidate: HandCandidate, quality: HandQuality, config: SelectionConfig = DEFAULT_SELECTION): IgnoredReason | null {
  if (candidate.landmarks.length < 63) return 'low_score';
  if (candidate.score < config.minScore) return 'low_score';
  if (!quality.inside) return 'cut_off';
  if (quality.palm < config.minPalm) return 'too_small';
  return null;
}

export interface Selection {
  hand: HandCandidate | null;
  /** Why the hands that were seen were all left out, when none was chosen. */
  ignored: IgnoredReason | null;
}

/**
 * Picks the user's hand among up to two: the largest (closest to the camera),
 * near the center, and above all the same hand as before, by place and by
 * side, so a second hand entering the frame does not steal the cursor.
 */
export class HandSelector {
  private lastWrist: Vec2 | null = null;
  private lastSide: 'left' | 'right' | null = null;

  constructor(private readonly config: SelectionConfig = DEFAULT_SELECTION) {}

  choose(candidates: readonly HandCandidate[], aspect: number): Selection {
    let best: HandCandidate | null = null;
    let bestScore = -Infinity;
    let bestWrist: Vec2 | null = null;
    let ignored: IgnoredReason | null = null;
    for (const candidate of candidates) {
      const quality = handQuality(candidate.landmarks, aspect, this.config.edgeMargin);
      const reason = rejectHand(candidate, quality, this.config);
      if (reason) {
        ignored ??= reason;
        continue;
      }
      let score = quality.palm * 10 - Math.hypot(quality.center.x - 0.5, quality.center.y - 0.5);
      if (this.lastWrist && Math.hypot(quality.wrist.x - this.lastWrist.x, quality.wrist.y - this.lastWrist.y) < 0.15) score += 2;
      if (this.lastSide && candidate.handedness === this.lastSide) score += 0.5;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
        bestWrist = quality.wrist;
      }
    }
    if (best) {
      this.lastWrist = bestWrist;
      this.lastSide = best.handedness ?? this.lastSide;
      return { hand: best, ignored: null };
    }
    this.lastWrist = null;
    return { hand: null, ignored };
  }
}

/** Gestures count only once the same hand has stayed in view for a few frames and a little time. */
export class StabilityGate {
  private since = -1;
  private frames = 0;

  constructor(
    private readonly minFrames = 4,
    private readonly minMs = 120,
  ) {}

  /** Feeds one frame; true when the hand has been steady long enough to act on. */
  update(handVisible: boolean, t: number): boolean {
    if (!handVisible) {
      this.since = -1;
      this.frames = 0;
      return false;
    }
    if (this.since < 0) this.since = t;
    this.frames++;
    return this.frames >= this.minFrames && t - this.since >= this.minMs;
  }

  get settling(): boolean {
    return this.since >= 0 && this.frames < this.minFrames;
  }
}

/**
 * Too dark to trust: the mean brightness of the frame (0 to 255) stays below
 * enter for a while; it clears only above exit, so the state does not flicker.
 */
export class LightGate {
  private darkSince = -1;
  private brightSince = -1;
  private dark = false;

  constructor(
    private readonly enter = 35,
    private readonly exit = 50,
    private readonly holdMs = 600,
  ) {}

  update(brightness: number | null | undefined, t: number): boolean {
    if (brightness === null || brightness === undefined || brightness < 0) return this.dark;
    if (!this.dark) {
      if (brightness < this.enter) {
        if (this.darkSince < 0) this.darkSince = t;
        if (t - this.darkSince >= this.holdMs) {
          this.dark = true;
          this.brightSince = -1;
        }
      } else {
        this.darkSince = -1;
      }
    } else if (brightness > this.exit) {
      if (this.brightSince < 0) this.brightSince = t;
      if (t - this.brightSince >= this.holdMs) {
        this.dark = false;
        this.darkSince = -1;
      }
    } else {
      this.brightSince = -1;
    }
    return this.dark;
  }

  get isDark(): boolean {
    return this.dark;
  }
}

/**
 * Keeps gestures from turning into loops: a short pause after any action, a
 * longer one before the same gesture acts again, and a stop when actions come
 * faster than a person makes them on purpose.
 */
export class ActionGuard {
  private lastAt = -Infinity;
  private readonly lastByKey = new Map<string, number>();
  private recent: number[] = [];
  private blockedUntil = -Infinity;

  constructor(
    private readonly gapMs = 250,
    private readonly sameKeyMs = 700,
    private readonly burst = 4,
    private readonly burstWindowMs = 3000,
    private readonly coolDownMs = 2000,
  ) {}

  /** True when the gesture may act now; records it when it does. */
  allow(key: string, t: number): boolean {
    if (t < this.blockedUntil) return false;
    if (t - this.lastAt < this.gapMs) return false;
    const last = this.lastByKey.get(key);
    if (last !== undefined && t - last < this.sameKeyMs) return false;
    this.recent = this.recent.filter((at) => t - at < this.burstWindowMs);
    if (this.recent.length >= this.burst) {
      this.blockedUntil = t + this.coolDownMs;
      this.recent = [];
      return false;
    }
    this.recent.push(t);
    this.lastAt = t;
    this.lastByKey.set(key, t);
    return true;
  }
}

export type CursorLook = 'live' | 'lost' | 'hidden';

/**
 * The cursor when the hand comes and goes: it freezes where the hand was and
 * fades, disappears after a while, and when the hand comes back it glides
 * from where it froze instead of jumping.
 */
export class CursorMotion {
  private shown: Vec2 | null = null;
  private lostAt = -1;
  private backAt = -1;
  private from: Vec2 | null = null;

  constructor(
    private readonly fadeMs = 1200,
    private readonly glideMs = 160,
  ) {}

  /** The position to draw and how, for the target of this frame (null when the hand is lost). */
  update(target: Vec2 | null, t: number): { position: Vec2 | null; look: CursorLook } {
    if (!target) {
      if (!this.shown) return { position: null, look: 'hidden' };
      if (this.lostAt < 0) this.lostAt = t;
      if (t - this.lostAt >= this.fadeMs) {
        this.shown = null;
        this.from = null;
        return { position: null, look: 'hidden' };
      }
      return { position: this.shown, look: 'lost' };
    }
    if (this.lostAt >= 0 && this.shown) {
      // The hand is back: glide from where the cursor froze.
      this.from = this.shown;
      this.backAt = t;
    }
    this.lostAt = -1;
    let position = target;
    if (this.from && this.backAt >= 0) {
      const k = Math.min(1, (t - this.backAt) / this.glideMs);
      position = { x: this.from.x + (target.x - this.from.x) * k, y: this.from.y + (target.y - this.from.y) * k };
      if (k >= 1) {
        this.from = null;
        this.backAt = -1;
      }
    }
    this.shown = position;
    return { position, look: 'live' };
  }
}

/** Why the hand does or does not move things, in the order the user should hear it. */
export type TrackerCondition =
  | 'ok'
  | 'settling'
  | 'no_hand'
  | 'ignored_hand'
  | 'too_dark'
  | 'hot'
  | 'camera_busy'
  | 'camera_disabled'
  | 'camera_error';

/**
 * One condition for the bubble and Live: camera trouble first (nothing works
 * without the camera), then heat, then light, then the hand itself.
 */
export function trackerCondition(
  camera: string,
  thermal: number,
  dark: boolean,
  hand: 'none' | 'ignored' | 'settling' | 'ready',
): TrackerCondition {
  if (camera === 'busy') return 'camera_busy';
  if (camera === 'disabled') return 'camera_disabled';
  if (camera === 'error') return 'camera_error';
  if (thermal >= 3) return 'hot';
  if (dark) return 'too_dark';
  if (hand === 'ignored') return 'ignored_hand';
  if (hand === 'none') return 'no_hand';
  if (hand === 'settling') return 'settling';
  return 'ok';
}
