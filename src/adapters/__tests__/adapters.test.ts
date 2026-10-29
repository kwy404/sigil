import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner, toolDefinitions } from '../../sigil-core';
import { footprint, MODEL_CATALOG, MODEL_TIERS, recommendTier } from '../catalog';
import { buildMessages, extractToolCallsFromText, MockChatEngine, ToolCallingModel, type ChatEngine } from '../model';
import { ListenAbortedError, MockSpeechToText } from '../voice';

const profiles = ProfileRegistry.withBuiltins();

describe('MockSpeechToText', () => {
  it('hears the scripted sentences in order, with partial results', async () => {
    const stt = new MockSpeechToText(['open YouTube', 'go back'], { wordDelayMs: 0 });
    const partials: string[] = [];
    const first = await stt.listen({ locale: 'en-US', onPartial: (t) => partials.push(t) });
    expect(first).toMatchObject({ text: 'open YouTube', locale: 'en-US', engine: 'mock' });
    expect(partials).toEqual(['open', 'open YouTube']);
    expect((await stt.listen({ locale: 'en-US' })).text).toBe('go back');
    expect((await stt.listen({ locale: 'en-US' })).text).toBe('open YouTube');
  });

  it('stops when cancelled', async () => {
    const stt = new MockSpeechToText(['open YouTube'], { wordDelayMs: 0 });
    const controller = new AbortController();
    controller.abort();
    await expect(stt.listen({ locale: 'en-US', signal: controller.signal })).rejects.toBeInstanceOf(ListenAbortedError);
  });
});

describe('extractToolCallsFromText', () => {
  it('reads tool calls printed as JSON, inside tags or prose', () => {
    expect(extractToolCallsFromText('<tool_call>{"name": "scroll", "arguments": {"direction": "down"}}</tool_call>')).toEqual([
      { name: 'scroll', arguments: { direction: 'down' } },
    ]);
    expect(extractToolCallsFromText('Sure! {"function": {"name": "open_app", "arguments": {"app": "YouTube"}}}')).toEqual([
      { name: 'open_app', arguments: { app: 'YouTube' } },
    ]);
    expect(extractToolCallsFromText('{"name":"tap","parameters":{"label":"a {brace} \\"quoted\\""}}')).toEqual([
      { name: 'tap', arguments: { label: 'a {brace} "quoted"' } },
    ]);
  });

  it('returns nothing for text without a call', () => {
    expect(extractToolCallsFromText('I cannot help with that.')).toEqual([]);
    expect(extractToolCallsFromText('{"broken": ')).toEqual([]);
  });
});

describe('ToolCallingModel', () => {
  it('drives the planner through a chat engine', async () => {
    const planner0 = new ActionPlanner({ profiles });
    const engine = new MockChatEngine(planner0.knownApps());
    const model = new ToolCallingModel('mock-local', () => engine);
    const planner = new ActionPlanner({ profiles, model });
    const outcome = await planner.plan({ text: 'search for lofi beats on YouTube', locale: 'en-US' });
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('model');
    const request = engine.requests[0];
    expect(request.toolChoice).toBe('required');
    expect(request.tools).toEqual(toolDefinitions());
    expect(request.messages[0].content).toContain('exactly one tool call');
    expect(request.messages[0].content).toContain('Write app names as the user said them');
    expect(request.messages[1]).toEqual({ role: 'system', content: 'App on screen: unknown. Request language: en-US.' });
    expect(request.messages[2]).toEqual({ role: 'user', content: 'search for lofi beats on YouTube' });
  });

  it('keeps the first system message the same for every request, so the runtime can cache it with the tools', () => {
    const first = buildMessages('open YouTube', { locale: 'en-US', foregroundApp: null, knownApps: ['WhatsApp', 'zap'] });
    // A phone with hundreds of apps installed gets the same system message: the names are not listed.
    const installed = Array.from({ length: 300 }, (_, i) => `App ${i}`);
    const second = buildMessages('manda oi pra Ana', { locale: 'pt-BR', foregroundApp: 'WhatsApp', knownApps: installed });
    expect(second[0]).toEqual(first[0]);
    expect(first[0].content).not.toContain('zap');
    expect(second[1].content).toBe('App on screen: WhatsApp. Request language: pt-BR.');
  });

  it('falls back to JSON in the text channel', async () => {
    const engine: ChatEngine = {
      id: 'text-only',
      complete: async () => ({ text: '```json\n{"name":"navigate","arguments":{"action":"home"}}\n```', toolCalls: [] }),
    };
    const model = new ToolCallingModel('text-only', () => engine);
    const reply = await model.propose('go home', { locale: 'en-US', foregroundApp: null, knownApps: [] }, []);
    expect(reply.toolCalls).toEqual([{ name: 'navigate', arguments: { action: 'home' } }]);
  });

  it('is not ready until an engine is loaded', async () => {
    let engine: ChatEngine | null = null;
    const model = new ToolCallingModel('lazy', () => engine);
    expect(model.isReady()).toBe(false);
    await expect(model.propose('go home', { locale: 'en-US', foregroundApp: null, knownApps: [] }, [])).rejects.toThrow(
      'not loaded',
    );
    engine = new MockChatEngine();
    expect(model.isReady()).toBe(true);
  });
});

describe('model catalog', () => {
  it('has unique ids and tiers made of known assets', () => {
    const ids = MODEL_CATALOG.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const tier of MODEL_TIERS) {
      expect(() => footprint(tier.assets)).not.toThrow();
    }
  });

  it('adds up downloads and counts speech and language models as taking turns', () => {
    expect(footprint(['hand-landmarker', 'whisper-base-q5_1', 'qwen2.5-1.5b-q4_k_m'])).toEqual({
      downloadMb: 1134,
      peakMemoryMb: 1410,
      residentMemoryMb: 1610,
    });
    expect(() => footprint(['nope'])).toThrow('Unknown model asset');
  });

  it('recommends a tier that fits the phone', () => {
    expect(recommendTier(3072).id).toBe('rules');
    expect(recommendTier(4096).id).toBe('rules');
    expect(recommendTier(6144).id).toBe('lite');
    expect(recommendTier(8192).id).toBe('full');
    expect(recommendTier(12288).id).toBe('full');
    expect(recommendTier(8192, 0.2).id).toBe('lite');
  });
});
