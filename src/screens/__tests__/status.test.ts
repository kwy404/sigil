import { describe, expect, it } from '@jest/globals';

import { MESSAGES } from '../../i18n';
import { parsePreferences } from '../../preferences/storage.shared';
import type { ChecklistItem, SessionState } from '../../session/types';
import { essentialMissing, errorText, missingItems, sessionStatus } from '../status';

const ALL: Record<ChecklistItem, boolean> = {
  accessibility: true,
  overlay: true,
  camera: true,
  microphone: true,
  notifications: true,
  restrictedSettings: true,
};

function session(patch: Partial<SessionState>): SessionState {
  return {
    phase: 'off',
    hand: 'none',
    listening: false,
    micLevel: 0,
    lastGesture: null,
    lastCommand: null,
    checklist: ALL,
    levels: { volume: null, brightness: null },
    error: null,
    condition: 'ok',
    ...patch,
  };
}

const m = MESSAGES.en;

describe('finish setup', () => {
  it('lists what is missing in the order Sigil asks, with restricted settings before accessibility', () => {
    expect(missingItems({ ...ALL, accessibility: false, camera: false, restrictedSettings: false, notifications: false })).toEqual([
      'camera',
      'restrictedSettings',
      'accessibility',
      'notifications',
    ]);
  });

  it('drops restricted settings once accessibility is on', () => {
    expect(missingItems({ ...ALL, restrictedSettings: false })).toEqual([]);
  });

  it('does not count notifications as needed', () => {
    expect(essentialMissing({ ...ALL, notifications: false })).toEqual([]);
    expect(essentialMissing({ ...ALL, overlay: false })).toEqual(['overlay']);
  });
});

describe('session status', () => {
  it('says what the session does, listening first', () => {
    expect(sessionStatus(session({ phase: 'tracking', hand: 'right' }), m)).toMatchObject({
      tone: 'accent',
      label: 'Tracking',
      line: 'Active · Right hand',
      live: true,
    });
    expect(sessionStatus(session({ phase: 'tracking', listening: true }), m).label).toBe('Listening');
    expect(sessionStatus(session({ phase: 'paused' }), m).tone).toBe('warning');
  });

  it('asks for setup while something needed is missing', () => {
    expect(sessionStatus(session({ checklist: { ...ALL, camera: false } }), m).label).toBe('Needs setup');
    expect(sessionStatus(session({ checklist: { ...ALL, notifications: false } }), m).label).toBe('Off');
  });

  it('turns the start errors into words and shows other errors as they come', () => {
    expect(errorText('camera_permission', m)).toBe(m.ui.session.errors.cameraPermission);
    expect(errorText('failed', m)).toBe(m.ui.session.errors.cameraService);
    expect(errorText('unavailable', m)).toBe(m.ui.session.errors.unavailable);
    expect(errorText('tracker crashed', m)).toBe('Stopped: tracker crashed');
    expect(sessionStatus(session({ phase: 'error', error: 'unavailable' }), m).line).toBe(m.ui.session.errors.unavailable);
  });
});

describe('preferences', () => {
  it('read a saved file and fall back on anything broken', () => {
    expect(parsePreferences(null)).toEqual({ tour: null, haptics: true });
    expect(parsePreferences('not json')).toEqual({ tour: null, haptics: true });
    expect(parsePreferences(JSON.stringify({ haptics: false, tour: { version: 2, completedAt: 9, skipped: ['overlay'] } }))).toEqual({
      haptics: false,
      tour: { version: 2, completedAt: 9, skipped: ['overlay'] },
    });
  });
});
