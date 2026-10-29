import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner, type LanguageModel, type ModelContext, type ModelReply, type ToolDefinition } from '..';

const profiles = ProfileRegistry.withBuiltins();

/** A model that records the signal and the prepare calls the planner gives it. */
class ProbeModel implements LanguageModel {
  readonly id = 'probe';
  readonly kind = 'local' as const;
  ready: boolean;
  prepared: ModelContext[] = [];
  signals: AbortSignal[] = [];

  constructor(
    private readonly answer: (signal: AbortSignal) => Promise<ModelReply>,
    ready = true,
  ) {
    this.ready = ready;
  }

  isReady(): boolean {
    return this.ready;
  }

  prepare(context: ModelContext, tools: readonly ToolDefinition[]): void {
    expect(tools).toHaveLength(17);
    this.prepared.push(context);
  }

  propose(_request: string, _context: ModelContext, _tools: readonly ToolDefinition[], signal?: AbortSignal): Promise<ModelReply> {
    if (!signal) throw new Error('The planner must pass a signal');
    this.signals.push(signal);
    return this.answer(signal);
  }
}

/** Never answers on its own; settles when its signal aborts, like the engine after stopCompletion. */
function slowUntilAborted(signal: AbortSignal): Promise<ModelReply> {
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('stopped')));
  });
}

describe('ActionPlanner and an on device model', () => {
  it('aborts the model when it runs out of time, then plans with the rules', async () => {
    const model = new ProbeModel(slowUntilAborted);
    const outcome = await new ActionPlanner({ profiles, model, modelTimeoutMs: 20 }).plan({ text: 'go home' });
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('rules');
    expect(outcome.status === 'planned' && outcome.notes).toEqual(['Model unavailable: no answer after 20 ms']);
    expect(model.signals[0].aborted).toBe(true);
  });

  it('passes the caller cancellation on to the model', async () => {
    const model = new ProbeModel(slowUntilAborted);
    const controller = new AbortController();
    const pending = new ActionPlanner({ profiles, model, modelTimeoutMs: 5000 }).plan({ text: 'go home' }, controller.signal);
    controller.abort();
    const outcome = await pending;
    expect(model.signals[0].aborted).toBe(true);
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('rules');
  });

  it('starts loading a model that is not ready and lets the rules answer meanwhile', async () => {
    const model = new ProbeModel(async () => ({ toolCalls: [{ name: 'navigate', arguments: { action: 'back' } }] }), false);
    const planner = new ActionPlanner({ profiles, model });
    const outcome = await planner.plan({ text: 'go home', locale: 'pt-BR', foregroundPackage: 'com.whatsapp' });
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('rules');
    expect(outcome.status === 'planned' && outcome.notes).toEqual(['The model is not loaded yet. The rules planned this request.']);
    expect(model.signals).toHaveLength(0);
    expect(model.prepared).toEqual([{ locale: 'pt-BR', foregroundApp: 'WhatsApp', knownApps: planner.knownApps() }]);

    model.ready = true;
    const next = await planner.plan({ text: 'go home' });
    expect(next.status === 'planned' && next.plan.intent).toEqual({ tool: 'navigate', args: { action: 'back' } });
    expect(next.status === 'planned' && next.plan.source).toBe('model');
  });

  it('prepares the model ahead of a request only when it is not ready', () => {
    const model = new ProbeModel(slowUntilAborted, false);
    const planner = new ActionPlanner({ profiles, model });
    planner.prepareModel({ locale: 'ja-JP' });
    expect(model.prepared).toEqual([{ locale: 'ja-JP', foregroundApp: null, knownApps: planner.knownApps() }]);
    model.ready = true;
    planner.prepareModel();
    expect(model.prepared).toHaveLength(1);
    expect(() => new ActionPlanner({ profiles }).prepareModel()).not.toThrow();
  });

  it('keeps the confirmation before sending when the model planned the message', async () => {
    const model = new ProbeModel(async () => ({
      toolCalls: [{ name: 'send_message', arguments: '{"contact":"Ana","text":"chego em 10 minutos"}' }],
    }));
    const outcome = await new ActionPlanner({ profiles, model }).plan({ text: 'avisa a Ana que chego em 10 minutos', locale: 'pt-BR' });
    expect(outcome.status).toBe('planned');
    if (outcome.status === 'planned') {
      expect(outcome.plan.source).toBe('model');
      expect(outcome.plan.needsConfirmation).toBe(true);
      const kinds = outcome.plan.steps.map((step) => step.kind);
      expect(kinds.indexOf('confirm')).toBe(kinds.length - 2);
      expect(outcome.plan.steps.at(-1)).toMatchObject({ kind: 'tap', commit: true });
    }
  });
});
