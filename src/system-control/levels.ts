import * as Brightness from 'expo-brightness';

import type { ControlResult } from '../sigil-core/executor';
import { InAppDeviceController, toControlResult, VOICE_BRIGHTNESS_STEP } from './devices';
import type { NativeControl } from './native';

/** Volume and brightness as the Control Sphere shows them. */
export interface LevelsSnapshot {
  /** Media volume from 0 to 1, or null where Sigil cannot read it (iOS, Expo Go, the web). */
  volume: number | null;
  muted: boolean;
  /** Position of the brightness slider from 0 to 1, or null where it cannot be read. */
  brightness: number | null;
}

export const UNKNOWN_LEVELS: LevelsSnapshot = { volume: null, muted: false, brightness: null };

/**
 * Reads the levels. With the Android module both come from the system, so
 * changes made with the hardware keys or the system panel show up too. Without
 * it only the brightness can be read, through expo-brightness (on iOS the
 * screen brightness; iOS gives apps no way to read or set the system volume
 * beyond its own volume view).
 */
export async function readLevels(native: NativeControl | null): Promise<LevelsSnapshot> {
  if (native) {
    try {
      const volume = native.getVolume('media');
      return { volume: volume.level, muted: volume.muted, brightness: native.getBrightness().level };
    } catch {
      return UNKNOWN_LEVELS;
    }
  }
  try {
    const brightness = (await Brightness.isAvailableAsync()) ? await Brightness.getBrightnessAsync() : null;
    return { ...UNKNOWN_LEVELS, brightness };
  } catch {
    return UNKNOWN_LEVELS;
  }
}

/** One quick volume step (about a tenth), or mute and unmute, on the media stream. */
export async function changeMediaVolume(
  native: NativeControl | null,
  action: 'up' | 'down' | 'mute' | 'unmute',
): Promise<ControlResult> {
  if (!native) {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    return toControlResult(await native.changeVolume('media', action, 0));
  } catch {
    return { ok: false, reason: 'failed' };
  }
}

/** One quick brightness step. On Android it needs "Modify system settings" and reports write_settings without it. */
export async function changeScreenBrightness(native: NativeControl | null, direction: 'up' | 'down'): Promise<ControlResult> {
  if (!native) {
    return new InAppDeviceController().brightness({ action: direction });
  }
  try {
    return toControlResult(await native.changeBrightness(direction, VOICE_BRIGHTNESS_STEP));
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
