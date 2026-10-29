import { getSystemControl } from '../../system-control';

export type MediaKey = 'previous' | 'play_pause' | 'next';

/**
 * Media keys for the player in front. The session contract has no media
 * action, so this is the one place a screen reaches the system control layer
 * directly; it goes through the accessibility service like the planner's
 * media steps. Returns false where the player cannot be reached.
 */
export async function sendMediaKey(key: MediaKey): Promise<boolean> {
  try {
    return await getSystemControl().device.media(key);
  } catch {
    return false;
  }
}
