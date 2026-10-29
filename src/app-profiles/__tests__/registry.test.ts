import { describe, expect, it } from '@jest/globals';

import {
  BUILTIN_PROFILE_SOURCES,
  describeAction,
  GENERAL_PROFILE_ID,
  ProfileRegistry,
  validateProfile,
  type ProfileIssue,
} from '..';
import { GESTURE_KEYS } from '../../gesture-engine';

function profile(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id: 'notes',
    name: 'Notes',
    packages: ['com.example.notes'],
    bindings: {},
    ...overrides,
  };
}

function issuePaths(issues: ProfileIssue[]): string[] {
  return issues.map((i) => i.path);
}

describe('built in profiles', () => {
  const registry = ProfileRegistry.withBuiltins();

  it('are all valid and loaded with general first', () => {
    expect(BUILTIN_PROFILE_SOURCES).toHaveLength(8);
    expect(registry.list().map((p) => p.id)).toEqual([
      'general',
      'chrome',
      'instagram',
      'messages',
      'settings',
      'tiktok',
      'whatsapp',
      'youtube',
    ]);
  });

  it('give every gesture a meaning in every app', () => {
    for (const p of registry.list()) {
      const bound = registry.bindings(p.id).map((b) => b.key);
      // point only moves the cursor, so it is the one gesture without an action.
      expect(bound).toEqual(GESTURE_KEYS.filter((k) => k !== 'point'));
    }
  });

  it('mark the send and share controls as commits', () => {
    expect(registry.selector('whatsapp', 'send')?.commit).toBe(true);
    expect(registry.selector('messages', 'send')?.commit).toBe(true);
    expect(registry.selector('instagram', 'share')?.commit).toBe(true);
    expect(registry.selector('whatsapp', 'messageInput')?.commit).toBeUndefined();
  });
});

describe('ProfileRegistry.resolve', () => {
  const registry = ProfileRegistry.withBuiltins();

  it('uses the app profile first', () => {
    expect(registry.resolve('com.whatsapp', 'flick_right')).toEqual({
      key: 'flick_right',
      action: { type: 'swipe', direction: 'right', origin: 'cursor' },
      profileId: 'whatsapp',
      inherited: false,
    });
    expect(registry.resolve('com.google.android.youtube', 'swipe_two_left')?.action).toEqual({ type: 'media', action: 'next' });
  });

  it('falls back to the general profile', () => {
    expect(registry.resolve('com.whatsapp', 'pinch')).toEqual({
      key: 'pinch',
      action: { type: 'tap' },
      profileId: GENERAL_PROFILE_ID,
      inherited: true,
    });
    expect(registry.resolve('org.unknown.app', 'open_palm')?.action).toEqual({ type: 'sphere', action: 'toggle' });
    expect(registry.resolve(null, 'circle_cw')?.action).toEqual({ type: 'volume', direction: 'up' });
  });

  it('matches every package of a profile', () => {
    expect(registry.forPackage('com.ss.android.ugc.trill').id).toBe('tiktok');
    expect(registry.forPackage('com.zhiliaoapp.musically').id).toBe('tiktok');
    expect(registry.forPackage(undefined).id).toBe('general');
  });

  it('lets a profile switch off an inherited gesture with none', () => {
    const local = ProfileRegistry.withBuiltins();
    expect(local.register(profile({ bindings: { fist: { type: 'none' } } })).ok).toBe(true);
    expect(local.resolve('com.example.notes', 'fist')).toBeNull();
    expect(local.resolve('com.example.notes', 'pinch')?.action).toEqual({ type: 'tap' });
  });

  it('inherits through a chain of profiles', () => {
    const local = ProfileRegistry.withBuiltins();
    expect(local.register(profile({ id: 'notes-pro', packages: ['com.example.notes.pro'], extends: 'whatsapp' })).ok).toBe(true);
    expect(local.resolve('com.example.notes.pro', 'flick_right')?.profileId).toBe('whatsapp');
    expect(local.selector('notes-pro', 'send')?.commit).toBe(true);
  });
});

describe('profile validation', () => {
  const register = (raw: unknown) => {
    const registry = ProfileRegistry.withBuiltins();
    const result = registry.register(raw);
    return result.ok ? [] : result.issues;
  };

  it('accepts a minimal app profile', () => {
    expect(register(profile({}))).toEqual([]);
  });

  it('rejects unknown gestures, unknown actions and unknown keys', () => {
    const unknownGesture = register(profile({ bindings: { wave: { type: 'tap' } } }));
    expect(unknownGesture.map((i) => `${i.path} ${i.message}`)).toEqual(['bindings Unrecognized key: "wave"']);
    expect(issuePaths(register(profile({ bindings: { pinch: { type: 'send_message' } } })))).toContain('bindings.pinch.type');
    expect(issuePaths(register(profile({ bindings: { pinch: { type: 'tap', target: 'send' } } })))).toContain('bindings.pinch');
    expect(register(profile({ bindigns: {} })).map((i) => i.message).join(' ')).toContain('bindigns');
  });

  it('rejects bad package names and app profiles without packages', () => {
    expect(issuePaths(register(profile({ packages: ['not a package'] })))).toEqual(['packages.0']);
    expect(issuePaths(register(profile({ packages: [] })))).toEqual(['packages']);
  });

  it('rejects a package that another profile owns', () => {
    const issues = register(profile({ packages: ['com.whatsapp'] }));
    expect(issues[0].message).toContain('whatsapp');
  });

  it('rejects duplicate ids unless replacing', () => {
    const registry = ProfileRegistry.withBuiltins();
    const youtube = registry.get('youtube');
    expect(registry.register(youtube).ok).toBe(false);
    expect(registry.register({ ...youtube, name: 'YouTube Music' }, { replace: true }).ok).toBe(true);
    expect(registry.get('youtube')?.name).toBe('YouTube Music');
  });

  it('rejects unknown parents and cycles', () => {
    expect(issuePaths(register(profile({ extends: 'missing' })))).toEqual(['extends']);
    const registry = ProfileRegistry.withBuiltins();
    expect(registry.register(profile({ id: 'a', packages: ['com.example.a'] })).ok).toBe(true);
    expect(registry.register(profile({ id: 'b', packages: ['com.example.b'], extends: 'a' })).ok).toBe(true);
    const cycle = registry.register(profile({ id: 'a', packages: ['com.example.a'], extends: 'b' }), { replace: true });
    expect(cycle.ok).toBe(false);
  });

  it('only allows drag on pinch and hold', () => {
    expect(issuePaths(register(profile({ bindings: { fist: { type: 'drag' } } })))).toEqual(['bindings.fist']);
    expect(register(profile({ bindings: { pinch_hold: { type: 'drag' } } }))).toEqual([]);
  });

  it('keeps the Control Sphere reachable', () => {
    const issues = register(profile({ bindings: { open_palm: { type: 'none' } } }));
    expect(issues.map((i) => i.path)).toEqual(['bindings']);
    expect(register(profile({ bindings: { open_palm: { type: 'none' }, fist: { type: 'sphere', action: 'open' } } }))).toEqual([]);
  });

  it('checks open_app targets', () => {
    expect(register(profile({ bindings: { flick_up: { type: 'open_app', app: 'youtube' } } }))).toEqual([]);
    expect(register(profile({ bindings: { flick_up: { type: 'open_app', app: 'org.example.reader' } } }))).toEqual([]);
    expect(issuePaths(register(profile({ bindings: { flick_up: { type: 'open_app', app: 'my reader' } } })))).toEqual([
      'bindings.flick_up.app',
    ]);
  });

  it('keeps the general profile free of packages and parents', () => {
    const result = validateProfile({ schemaVersion: 1, id: 'general', name: 'General', packages: ['com.example'], bindings: {} });
    expect(result.ok).toBe(false);
  });

  it('needs the general profile before any app profile', () => {
    const registry = new ProfileRegistry();
    const result = registry.register(profile({}));
    expect(result.ok).toBe(false);
  });
});

describe('ProfileRegistry helpers', () => {
  const registry = ProfileRegistry.withBuiltins();

  it('finds apps by spoken names and aliases', () => {
    expect(registry.findApp('zap')?.id).toBe('whatsapp');
    expect(registry.findApp('WhatsApp')?.id).toBe('whatsapp');
    expect(registry.findApp('Configurações')?.id).toBe('settings');
    expect(registry.findApp('the YouTube app')?.id).toBe('youtube');
    expect(registry.findApp('o insta')?.id).toBe('instagram');
    expect(registry.findApp('com.android.chrome')?.id).toBe('chrome');
    expect(registry.findApp('calculator')).toBeUndefined();
    expect(registry.findApp('general')).toBeUndefined();
  });

  it('unregisters app profiles but never the general one', () => {
    const local = ProfileRegistry.withBuiltins();
    expect(local.unregister('general')).toBe(false);
    expect(local.unregister('instagram')).toBe(true);
    expect(local.forPackage('com.instagram.android').id).toBe('general');
  });

  it('describes actions for people', () => {
    expect(describeAction({ type: 'scroll', direction: 'down' })).toBe('Scroll down');
    expect(describeAction({ type: 'swipe', direction: 'right', origin: 'cursor' })).toBe('Swipe right from cursor');
    expect(describeAction({ type: 'global', action: 'recents' })).toBe('Recent apps');
    expect(describeAction({ type: 'sphere', action: 'toggle' })).toBe('Control Sphere');
  });
});
