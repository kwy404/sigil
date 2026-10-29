import { describe, expect, it } from '@jest/globals';

import { MESSAGES, numberFormatter, type DescribeContext } from '../../i18n';
import type { Plan, PlanOutcome } from '../../sigil-core';
import { endsRequest, voicePanel } from '../voice-panel';

const m = MESSAGES.en;
const ctx: DescribeContext = { m, format: numberFormatter('en'), appName: (id) => id };

const closeAll: Plan = {
  request: 'close all apps',
  intent: { tool: 'close_all_apps', args: {} },
  source: 'rules',
  summary: 'Close all apps',
  steps: [
    { kind: 'navigate', action: 'recents' },
    { kind: 'confirm', summary: 'Close all apps?', reason: 'close_all' },
  ],
  needsConfirmation: true,
};
const planned: PlanOutcome = { status: 'planned', plan: closeAll, notes: [] };

describe('the voice panel over other apps', () => {
  it('stays hidden while idle', () => {
    expect(voicePanel({ phase: 'idle' }, false, ctx)).toBeNull();
  });

  it('shows the level while listening, and says when the room is too noisy', () => {
    const quiet = voicePanel({ phase: 'listening', purpose: 'request', level: 0.6, noisy: false, partial: null, retry: null }, true, ctx);
    expect(quiet).toEqual({ title: m.voice.prompt.listening, message: '', level: 0.6, tone: 'listening' });
    const noisy = voicePanel({ phase: 'listening', purpose: 'request', level: 0.9, noisy: true, partial: null, retry: null }, true, ctx);
    expect(noisy?.message).toBe(m.voice.tooNoisy);
    const partial = voicePanel({ phase: 'listening', purpose: 'request', level: 0.4, noisy: true, partial: 'open you', retry: null }, true, ctx);
    expect(partial?.message).toBe('open you');
  });

  it('asks to repeat, and says when it gave up', () => {
    expect(voicePanel({ phase: 'repeat', reason: 'too_quiet', noisy: false }, true, ctx)?.message).toBe(m.voice.repeat);
    expect(voicePanel({ phase: 'repeat', reason: 'too_quiet', noisy: true }, true, ctx)?.message).toBe(m.voice.tooNoisy);
    expect(voicePanel({ phase: 'repeat', reason: 'low_confidence', noisy: false }, false, ctx)?.message).toBe(m.voice.gaveUp);
  });

  it('shows the question, what was heard when unsure, and the time left', () => {
    const panel = voicePanel(
      { phase: 'confirm', heard: 'close all apps', plan: closeAll, index: 1, secondsLeft: 5, level: 0.2, unsure: true },
      true,
      ctx,
    );
    expect(panel?.tone).toBe('question');
    expect(panel?.level).toBe(0.2);
    expect(panel?.message.split('\n')).toEqual([m.confirm.closeAll, m.voice.unsure('close all apps'), `${m.voice.answerHint} ${m.voice.seconds(5)}`]);
  });

  it('says how the request ended', () => {
    const done = voicePanel({ phase: 'done', heard: 'x', outcome: planned, result: { status: 'completed', completedSteps: 2 } }, false, ctx);
    expect(done).toMatchObject({ message: m.planner.result.completed, tone: 'info' });
    const cancelled = voicePanel({ phase: 'done', heard: 'x', outcome: planned, result: { status: 'cancelled', completedSteps: 1 } }, false, ctx);
    expect(cancelled?.tone).toBe('warning');
    const notUnderstood: PlanOutcome = { status: 'not_understood', message: 'no', notes: [], notice: { code: 'not_understood' } };
    expect(voicePanel({ phase: 'done', heard: 'x', outcome: notUnderstood, result: null }, false, ctx)?.message).toBe(m.voice.notUnderstood);
    expect(voicePanel({ phase: 'unavailable', reason: 'permission' }, false, ctx)?.message).toBe(m.voice.unavailable.permission);
    expect(voicePanel({ phase: 'unavailable', reason: 'network' }, false, ctx)?.message).toBe(m.voice.unavailable.failed);
    expect(voicePanel({ phase: 'cancelled' }, false, ctx)?.message).toBe(m.voice.cancelled);
  });

  it('lingers only once the request is over', () => {
    expect(endsRequest({ phase: 'cancelled' }, false)).toBe(true);
    expect(endsRequest({ phase: 'cancelled' }, true)).toBe(false);
    expect(endsRequest({ phase: 'thinking', heard: 'x' }, false)).toBe(false);
    expect(endsRequest({ phase: 'idle' }, false)).toBe(false);
  });
});
