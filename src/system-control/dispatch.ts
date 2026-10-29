import type { ProfileRegistry } from '../app-profiles/registry';
import type { ProfileAction } from '../app-profiles/schema';
import type { Vec2 } from '../gesture-engine/landmarks';
import type { NativeControl } from './native';

/** The native calls gesture actions need. NativeControl satisfies it; tests use a fake. */
export type GestureTarget = Pick<
  NativeControl,
  'tap' | 'doubleTap' | 'longPress' | 'swipe' | 'scroll' | 'globalAction' | 'mediaKey' | 'adjustVolume' | 'openApp'
>;

/** Actions that change Sigil's own interface instead of the app in front. */
export interface SigilUi {
  sphere(action: 'toggle' | 'open' | 'close'): void;
  listen(): void;
  cursor(action: 'toggle' | 'recenter'): void;
  pause(): void;
}

export interface DispatchContext {
  /** Cursor in screen pixels, or null when no hand is visible. */
  cursor: Vec2 | null;
  screen: { width: number; height: number };
  profiles: ProfileRegistry;
}

/** Fraction of the screen a gesture swipe travels. */
const SWIPE_SPAN = 0.4;
const SWIPE_MS = 220;

function swipeVector(direction: 'up' | 'down' | 'left' | 'right', length: number): Vec2 {
  switch (direction) {
    case 'up':
      return { x: 0, y: -length };
    case 'down':
      return { x: 0, y: length };
    case 'left':
      return { x: -length, y: 0 };
    case 'right':
      return { x: length, y: 0 };
  }
}

/**
 * Executes the action a gesture is bound to in the current app profile.
 * Pointer actions land exactly where the user holds the cursor, which makes
 * them direct manipulation: no confirmation is asked, as with a finger tap.
 * Returns false when the action could not be delivered.
 */
export async function dispatchProfileAction(
  action: ProfileAction,
  target: GestureTarget,
  ctx: DispatchContext,
  ui: SigilUi,
): Promise<boolean> {
  const cursor = ctx.cursor;
  switch (action.type) {
    case 'tap':
      return cursor ? target.tap(cursor.x, cursor.y) : false;
    case 'double_tap':
      return cursor ? target.doubleTap(cursor.x, cursor.y) : false;
    case 'long_press':
      return cursor ? target.longPress(cursor.x, cursor.y, action.durationMs ?? 650) : false;
    case 'drag':
      // Needs a continued stroke that follows the cursor; planned with the camera pipeline.
      return false;
    case 'scroll':
      return target.scroll(action.direction);
    case 'swipe': {
      const span = (action.direction === 'up' || action.direction === 'down' ? ctx.screen.height : ctx.screen.width) * SWIPE_SPAN;
      const from =
        action.origin === 'cursor' && cursor ? cursor : { x: ctx.screen.width / 2, y: ctx.screen.height / 2 };
      const move = swipeVector(action.direction, span);
      // Start half a span back so a center swipe is centered on the screen.
      const start = action.origin === 'cursor' ? from : { x: from.x - move.x / 2, y: from.y - move.y / 2 };
      return target.swipe(start.x, start.y, start.x + move.x, start.y + move.y, SWIPE_MS);
    }
    case 'global':
      return target.globalAction(action.action);
    case 'media':
      return target.mediaKey(action.action);
    case 'volume':
      return target.adjustVolume(action.direction);
    case 'open_app': {
      const profile = ctx.profiles.get(action.app);
      const packageName = profile ? profile.packages[0] : action.app;
      return target.openApp(packageName, null, null);
    }
    case 'sphere':
      ui.sphere(action.action);
      return true;
    case 'voice':
      ui.listen();
      return true;
    case 'cursor':
      ui.cursor(action.action);
      return true;
    case 'pause':
      ui.pause();
      return true;
    case 'none':
      return false;
  }
}
