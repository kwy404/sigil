import { describe, expect, it } from '@jest/globals';

import { changeMediaVolume, changeScreenBrightness, readLevels, type NativeControl } from '..';

function fakeNative(log: string[], brightness: 'done' | 'write_settings' = 'done'): NativeControl {
  const fake = {
    getVolume: () => ({ level: 0.4, index: 6, min: 0, max: 15, muted: false }),
    getBrightness: () => ({ level: 0.7, automatic: false, writable: brightness === 'done' }),
    changeVolume: async (stream: string, change: string, level: number) => {
      log.push(`volume ${stream} ${change} ${level}`);
      return 'done';
    },
    changeBrightness: async (change: string, level: number) => {
      log.push(`brightness ${change} ${level}`);
      return brightness;
    },
  };
  return fake as unknown as NativeControl;
}

describe('Control Sphere levels', () => {
  it('reads the media volume and the brightness slider from the system', async () => {
    expect(await readLevels(fakeNative([]))).toEqual({ volume: 0.4, muted: false, brightness: 0.7 });
  });

  it('steps the media volume and the brightness by a tenth', async () => {
    const log: string[] = [];
    const native = fakeNative(log);
    expect(await changeMediaVolume(native, 'up')).toEqual({ ok: true });
    expect(await changeMediaVolume(native, 'mute')).toEqual({ ok: true });
    expect(await changeScreenBrightness(native, 'down')).toEqual({ ok: true });
    expect(log).toEqual(['volume media up 0', 'volume media mute 0', 'brightness down 10']);
  });

  it('reports the missing access for the brightness and no volume control without the module', async () => {
    expect(await changeScreenBrightness(fakeNative([], 'write_settings'), 'up')).toEqual({
      ok: false,
      reason: 'needs_permission',
      permission: 'write_settings',
    });
    expect(await changeMediaVolume(null, 'up')).toEqual({ ok: false, reason: 'unsupported' });
  });
});
