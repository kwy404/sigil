import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { dispatchProfileAction, type GestureTarget, type SigilUi } from '../dispatch';

function fakeTarget(log: string[]): GestureTarget {
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      log.push(`${name} ${args.map((a) => (typeof a === 'number' ? Math.round(a) : String(a))).join(' ')}`);
      return true;
    };
  return {
    tap: record('tap'),
    doubleTap: record('doubleTap'),
    longPress: record('longPress'),
    swipe: record('swipe'),
    scroll: record('scroll'),
    globalAction: record('globalAction'),
    mediaKey: record('mediaKey'),
    adjustVolume: record('adjustVolume'),
    openApp: record('openApp'),
  };
}

function fakeUi(log: string[]): SigilUi {
  return {
    sphere: (action) => log.push(`sphere ${action}`),
    listen: () => log.push('listen'),
    cursor: (action) => log.push(`cursor ${action}`),
    pause: () => log.push('pause'),
  };
}

const profiles = ProfileRegistry.withBuiltins();
const ctx = { cursor: { x: 300, y: 900 }, screen: { width: 1080, height: 2400 }, profiles };

describe('dispatchProfileAction', () => {
  it('lands pointer actions on the cursor', async () => {
    const log: string[] = [];
    await dispatchProfileAction({ type: 'tap' }, fakeTarget(log), ctx, fakeUi(log));
    await dispatchProfileAction({ type: 'long_press' }, fakeTarget(log), ctx, fakeUi(log));
    expect(log).toEqual(['tap 300 900', 'longPress 300 900 650']);
  });

  it('does nothing with pointer actions when no hand is visible', async () => {
    const log: string[] = [];
    const delivered = await dispatchProfileAction({ type: 'tap' }, fakeTarget(log), { ...ctx, cursor: null }, fakeUi(log));
    expect(delivered).toBe(false);
    expect(log).toEqual([]);
  });

  it('centers screen swipes and starts cursor swipes at the cursor', async () => {
    const log: string[] = [];
    await dispatchProfileAction({ type: 'swipe', direction: 'up' }, fakeTarget(log), ctx, fakeUi(log));
    await dispatchProfileAction({ type: 'swipe', direction: 'right', origin: 'cursor' }, fakeTarget(log), ctx, fakeUi(log));
    expect(log).toEqual(['swipe 540 1680 540 720 220', 'swipe 300 900 732 900 220']);
  });

  it('maps navigation, media, volume and app actions', async () => {
    const log: string[] = [];
    const target = fakeTarget(log);
    await dispatchProfileAction({ type: 'global', action: 'back' }, target, ctx, fakeUi(log));
    await dispatchProfileAction({ type: 'media', action: 'next' }, target, ctx, fakeUi(log));
    await dispatchProfileAction({ type: 'volume', direction: 'down' }, target, ctx, fakeUi(log));
    await dispatchProfileAction({ type: 'open_app', app: 'youtube' }, target, ctx, fakeUi(log));
    await dispatchProfileAction({ type: 'scroll', direction: 'down' }, target, ctx, fakeUi(log));
    expect(log).toEqual([
      'globalAction back',
      'mediaKey next',
      'adjustVolume down',
      'openApp com.google.android.youtube null null',
      'scroll down',
    ]);
  });

  it('routes Sigil actions to its own interface', async () => {
    const log: string[] = [];
    await dispatchProfileAction({ type: 'sphere', action: 'toggle' }, fakeTarget(log), ctx, fakeUi(log));
    await dispatchProfileAction({ type: 'voice', action: 'listen' }, fakeTarget(log), ctx, fakeUi(log));
    expect(log).toEqual(['sphere toggle', 'listen']);
  });

  it('resolves every built in binding to a deliverable action', async () => {
    for (const profile of profiles.list()) {
      for (const binding of profiles.bindings(profile.id)) {
        const log: string[] = [];
        const delivered = await dispatchProfileAction(binding.action, fakeTarget(log), ctx, fakeUi(log));
        expect({ profile: profile.id, key: binding.key, delivered }).toEqual({ profile: profile.id, key: binding.key, delivered: true });
      }
    }
  });
});
