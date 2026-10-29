import { describe, expect, it } from '@jest/globals';

import { commandOutcome } from '../../runtime/sigil';
import type { Plan, PlanOutcome } from '../../sigil-core';
import type { VoiceState } from '../../voice/session';
import { isListening, micLevel, sessionPhase } from '../state';

const runtime = { starting: false, running: false, paused: false, error: null };

const plan: Plan = {
  request: 'open YouTube',
  intent: { tool: 'open_app', args: { app: 'YouTube' } },
  source: 'rules',
  summary: 'Open YouTube',
  steps: [],
  needsConfirmation: false,
};
const planned: PlanOutcome = { status: 'planned', plan, notes: [] };

describe('session phase', () => {
  it('follows the runtime', () => {
    expect(sessionPhase(runtime, null)).toBe('off');
    expect(sessionPhase({ ...runtime, starting: true }, null)).toBe('starting');
    expect(sessionPhase({ ...runtime, running: true }, null)).toBe('tracking');
    expect(sessionPhase({ ...runtime, running: true, paused: true }, null)).toBe('paused');
    expect(sessionPhase(runtime, 'camera_permission')).toBe('error');
    expect(sessionPhase({ ...runtime, error: 'camera busy' }, null)).toBe('error');
  });
});

describe('listening and the microphone level', () => {
  it('report the level only while Sigil listens or waits for an answer', () => {
    const listening: VoiceState = { phase: 'listening', purpose: 'request', level: 0.7, noisy: false, partial: null, retry: null };
    expect(isListening(listening)).toBe(true);
    expect(micLevel(listening)).toBe(0.7);
    const confirm: VoiceState = { phase: 'confirm', heard: 'x', plan, index: 0, secondsLeft: 8, level: 0.3, unsure: false };
    expect(micLevel(confirm)).toBe(0.3);
    expect(isListening({ phase: 'idle' })).toBe(false);
    expect(micLevel({ phase: 'thinking', heard: 'x' })).toBe(0);
  });
});

describe('the last command', () => {
  it('says how a finished request went', () => {
    expect(commandOutcome({ phase: 'done', heard: 'open YouTube', outcome: planned, result: { status: 'completed', completedSteps: 2 } }, false)).toMatchObject({
      text: 'open YouTube',
      outcome: 'done',
    });
    expect(commandOutcome({ phase: 'done', heard: 'x', outcome: planned, result: { status: 'cancelled', completedSteps: 0 } }, false)).toMatchObject({
      outcome: 'cancelled',
    });
    expect(commandOutcome({ phase: 'done', heard: 'x', outcome: planned, result: { status: 'failed', completedSteps: 0 } }, false)).toMatchObject({
      outcome: 'failed',
    });
    const blocked: PlanOutcome = { status: 'blocked', message: 'no', notice: { code: 'bulk' } };
    expect(commandOutcome({ phase: 'done', heard: 'x', outcome: blocked, result: null }, false)).toMatchObject({ outcome: 'failed' });
    expect(commandOutcome({ phase: 'repeat', reason: 'too_quiet', noisy: true }, false)).toMatchObject({ outcome: 'not_understood' });
    expect(commandOutcome({ phase: 'cancelled' }, false)).toMatchObject({ outcome: 'cancelled' });
  });

  it('waits while the request is still going', () => {
    expect(commandOutcome({ phase: 'repeat', reason: 'too_quiet', noisy: false }, true)).toBeNull();
    expect(commandOutcome({ phase: 'thinking', heard: 'x' }, true)).toBeNull();
  });
});
