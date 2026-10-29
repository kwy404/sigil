import { clamp } from './geometry';
import type { Vec2 } from './landmarks';

/**
 * Region of the camera frame, in normalized coordinates, that maps to the
 * whole screen. A box smaller than the frame lets the user reach every screen
 * edge without moving the hand out of view.
 */
export interface ControlBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const DEFAULT_CONTROL_BOX: ControlBox = { left: 0.2, top: 0.15, right: 0.8, bottom: 0.65 };

export interface ScreenSize {
  width: number;
  height: number;
}

/** Maps a normalized camera position to screen pixels, clamped to the screen. */
export function mapToScreen(point: Vec2, box: ControlBox, screen: ScreenSize): Vec2 {
  'worklet';
  const u = clamp((point.x - box.left) / (box.right - box.left), 0, 1);
  const v = clamp((point.y - box.top) / (box.bottom - box.top), 0, 1);
  return { x: u * screen.width, y: v * screen.height };
}
