import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner, toolDefinitions } from '../../sigil-core';
import {
  buildMessages,
  DEFAULT_CONTEXT_SIZE,
  DEFAULT_IDLE_RELEASE_MS,
  describeTool,
  LlamaChatEngine,
  threadCountFor,
  toolCallSchema,
  ToolCallingModel,
  toolList,
  type ChatRequest,
  type LlamaEngineOptions,
} from '../model';
import { FakeLlama, flush, toolCallResult } from './fakes';

const context = { locale: 'en-US', foregroundApp: null, knownApps: ['WhatsApp', 'YouTube'] };

function request(text: string): ChatRequest {
  return { messages: buildMessages(text, context), tools: toolDefinitions(), toolChoice: 'required', temperature: 0.1, maxTokens: 200 };
}

function engine(runtime: FakeLlama, options: Partial<LlamaEngineOptions> = {}): LlamaChatEngine {
  return new LlamaChatEngine({ id: 'qwen-test', modelPath: 'file:///data/models/q.gguf', runtime, idleReleaseMs: 0, ...options });
}

afterEach(() => {
  jest.useRealTimers();
});

describe('threadCountFor', () => {
  it('uses about half the cores, at most four', () => {
    expect([1, 2, 4, 6, 8, 10, 12].map(threadCountFor)).toEqual([1, 1, 2, 3, 4, 4, 4]);
    expect(threadCountFor(null)).toBe(4);
    expect(threadCountFor(0)).toBe(4);
  });
});

describe('LlamaChatEngine', () => {
  it('loads the model on the first request with a small context and the thread count', async () => {
    const runtime = new FakeLlama();
    const llama = engine(runtime, { threads: threadCountFor(8) });
    expect(runtime.inits).toHaveLength(0);
    expect(llama.isReady()).toBe(false);
    const response = await llama.complete(request('go home'));
    expect(runtime.inits).toEqual([
      {
        model: 'file:///data/models/q.gguf',
        n_ctx: DEFAULT_CONTEXT_SIZE,
        n_batch: 512,
        n_ubatch: 256,
        n_threads: 4,
        n_gpu_layers: 0,
        n_parallel: 1,
        use_mlock: false,
        use_mmap: true,
        ctx_shift: false,
      },
    ]);
    expect(DEFAULT_CONTEXT_SIZE).toBe(2048);
    expect(response).toEqual({ text: '', toolCalls: [{ name: 'navigate', arguments: '{"action":"home"}' }] });
    expect(llama.isReady()).toBe(true);
    await llama.complete(request('go back'));
    expect(runtime.inits).toHaveLength(1);
  });

  it('constrains the answer to one tool call with a JSON schema, through the model chat template', async () => {
    const runtime = new FakeLlama();
    runtime.reply = { text: '{"name": "open_app", "arguments": {"app": "YouTube"}}', content: '{"name": "open_app", "arguments": {"app": "YouTube"}}' };
    const response = await engine(runtime).complete(request('open YouTube'));
    expect(response.toolCalls).toEqual([{ name: 'open_app', arguments: { app: 'YouTube' } }]);
    const params = runtime.lastContext.completions[0];
    expect(params).toMatchObject({ jinja: true, n_predict: 200, temperature: 0.1, enable_thinking: false });
    expect(params.response_format).toEqual({ type: 'json_schema', json_schema: { strict: true, schema: toolCallSchema(toolDefinitions()) } });
    const sent = request('open YouTube').messages;
    expect(params.messages[0].content).toBe(`${sent[0].content}\n${toolList(toolDefinitions())}`);
    expect(params.messages.slice(1)).toEqual(sent.slice(1));
  });

  it('uses llama.cpp built in templates when the file has no Jinja template', async () => {
    const runtime = new FakeLlama();
    runtime.jinja = false;
    runtime.reply = { text: '{"name": "scroll", "arguments": {"direction": "down"}}' };
    const llama = engine(runtime);
    const model = new ToolCallingModel('plain', () => llama);
    const reply = await model.propose('scroll down', context, toolDefinitions());
    expect(reply.toolCalls).toEqual([{ name: 'scroll', arguments: { direction: 'down' } }]);
    expect(runtime.lastContext.completions[0].jinja).toBe(false);
  });

  it('also accepts tool calls parsed by the runtime', async () => {
    const runtime = new FakeLlama();
    runtime.reply = toolCallResult('media', { action: 'pause' });
    expect((await engine(runtime).complete(request('pause'))).toolCalls).toEqual([{ name: 'media', arguments: '{"action":"pause"}' }]);
  });

  it('lists every tool with its arguments, required ones first, and allows exactly one call in the schema', () => {
    const list = toolList(toolDefinitions());
    expect(list.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(toolDefinitions().length);
    expect(describeTool(toolDefinitions().find((t) => t.function.name === 'send_message')!)).toBe(
      '- send_message(contact: string, text: string, app?: string): Write a message to one contact in a messaging app. ' +
        'Sigil always asks the user to confirm before sending. contact: One contact name, exactly as the user said it. ' +
        'text: The message text, in the language the user used. app: Messaging app. Leave empty to use the default one.',
    );
    expect(describeTool(toolDefinitions().find((t) => t.function.name === 'volume')!)).toContain(
      'volume(action: "up" | "down" | "set" | "mute" | "unmute", level?: integer 0 to 100, stream?: "media" | "ring" | "alarm")',
    );
    const schema = toolCallSchema(toolDefinitions()) as { oneOf: { properties: { name: { const: string } }; required: string[] }[] };
    expect(schema.oneOf).toHaveLength(toolDefinitions().length);
    expect(schema.oneOf[0]).toMatchObject({ properties: { name: { const: 'open_app' } }, required: ['name', 'arguments'] });
    expect(JSON.stringify(schema)).not.toContain('additionalProperties');
  });

  it('keeps the prompt small enough for a 2048 token context with room for the answer', () => {
    // The planner passes every app name it knows, installed apps included; none of them reaches the prompt.
    const knownApps = new ActionPlanner({ profiles: ProfileRegistry.withBuiltins() }).knownApps();
    expect(knownApps.length).toBeGreaterThan(100);
    const messages = buildMessages('send a message to Ana on WhatsApp saying I will be there in ten minutes', {
      locale: 'pt-BR',
      foregroundApp: 'WhatsApp',
      knownApps,
    });
    const prompt = [`${messages[0].content}\n${toolList(toolDefinitions())}`, messages[1].content, messages[2].content].join('\n');
    // Pessimistic: 3 characters per token for English and the tool list, plus the chat template markers.
    const estimatedTokens = Math.ceil(prompt.length / 3) + 40;
    // The answer may use up to 200 tokens; keep a tenth of the context free on top.
    expect(estimatedTokens + 200).toBeLessThanOrEqual(DEFAULT_CONTEXT_SIZE * 0.9);
  });

  it('warms up the cache with the system prompt and tools when prepared, then reports ready', async () => {
    const runtime = new FakeLlama();
    const statuses: string[] = [];
    const llama = engine(runtime, { onStatus: (status) => statuses.push(status) });
    const model = new ToolCallingModel('qwen', () => llama);
    expect(model.isReady()).toBe(false);
    model.prepare(context, toolDefinitions());
    await flush(20);
    expect(runtime.inits).toHaveLength(1);
    const warmUp = runtime.lastContext.completions[0];
    expect(warmUp.n_predict).toBe(0);
    expect(statuses).toEqual(['loading', 'ready']);
    expect(model.isReady()).toBe(true);

    // A real request starts with the same system message, which llama.cpp finds in its cache.
    await model.propose('turn the volume up', { ...context, locale: 'pt-BR', foregroundApp: 'YouTube' }, toolDefinitions());
    expect(runtime.lastContext.completions[1].messages[0]).toEqual(warmUp.messages[0]);
    expect(runtime.inits).toHaveLength(1);
  });

  it('stops the generation when the request is aborted', async () => {
    const runtime = new FakeLlama();
    runtime.reply = (_params, ctx) => ctx.hang();
    const llama = engine(runtime);
    const controller = new AbortController();
    const pending = llama.complete(request('do something slow'), controller.signal);
    await flush(20);
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(runtime.lastContext.stops).toBe(1);
  });

  it('runs one operation at a time', async () => {
    const runtime = new FakeLlama();
    let finish!: () => void;
    runtime.reply = () =>
      new Promise((resolve) => {
        finish = () => resolve(toolCallResult('scroll', { direction: 'down' }));
      });
    const llama = engine(runtime);
    const first = llama.complete(request('scroll down'));
    const second = llama.complete(request('scroll down'));
    await flush(20);
    expect(runtime.lastContext.completions).toHaveLength(1);
    finish();
    await first;
    await flush(20);
    finish();
    await second;
    expect(runtime.lastContext.maxRunning).toBe(1);
  });

  it('releases the weights on demand, stopping a running generation first, and loads them again later', async () => {
    const runtime = new FakeLlama();
    runtime.reply = (_params, ctx) => ctx.hang();
    const llama = engine(runtime);
    const pending = llama.complete(request('slow'));
    await flush(20);
    await llama.release();
    expect(runtime.contexts[0].stops).toBe(1);
    expect(runtime.contexts[0].released).toBe(true);
    await pending;
    expect(llama.status).toBe('idle');
    expect(llama.isReady()).toBe(false);

    runtime.reply = toolCallResult('media', { action: 'pause' });
    await llama.complete(request('pause'));
    expect(runtime.inits).toHaveLength(2);
  });

  it('stops a warm up that is still running when the app releases the weights', async () => {
    const runtime = new FakeLlama();
    runtime.warmUp = (ctx) => ctx.hang();
    const llama = engine(runtime);
    llama.prepare(request(''));
    await flush(20);
    expect(llama.status).toBe('loading');
    await llama.release();
    expect(runtime.contexts[0].stops).toBe(1);
    expect(runtime.contexts[0].released).toBe(true);
    expect(llama.status).toBe('idle');
    expect(llama.isReady()).toBe(false);
  });

  it('keeps the weights for five minutes by default', () => {
    expect(DEFAULT_IDLE_RELEASE_MS).toBe(300_000);
  });

  it('releases the weights after the idle time without requests', async () => {
    jest.useFakeTimers();
    const runtime = new FakeLlama();
    const llama = engine(runtime, { idleReleaseMs: 60_000 });
    await llama.complete(request('go home'));
    jest.advanceTimersByTime(59_000);
    expect(runtime.lastContext.released).toBe(false);
    jest.advanceTimersByTime(1_000);
    await flush(20);
    expect(runtime.lastContext.released).toBe(true);
  });

  it('refuses to load while the phone is low on memory, and reports load errors', async () => {
    const runtime = new FakeLlama();
    const low = engine(runtime, { canLoad: () => 'The phone is low on memory.' });
    await expect(low.complete(request('go home'))).rejects.toThrow('low on memory');
    expect(runtime.inits).toHaveLength(0);
    expect(low.status).toBe('failed');

    runtime.failInit = new Error('Failed to load model');
    const broken = engine(runtime);
    await expect(broken.complete(request('go home'))).rejects.toThrow('Failed to load model');
    expect(broken.status).toBe('failed');
    expect(broken.error).toBe('Failed to load model');
  });

  it('reports a request that does not fit the context instead of returning nothing', async () => {
    const runtime = new FakeLlama();
    runtime.reply = { text: '', context_full: true };
    await expect(engine(runtime).complete(request('go home'))).rejects.toThrow('does not fit');
  });
});
