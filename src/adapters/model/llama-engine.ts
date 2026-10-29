import type { RawToolCall, ToolDefinition } from '../../sigil-core/tools';
import type { ChatEngine, ChatMessage, ChatRequest, ChatResponse } from './chat-engine';

/** The parameters of llama.rn's initLlama that Sigil sets. */
export interface LlamaInitParams {
  model: string;
  n_ctx: number;
  n_batch: number;
  n_ubatch: number;
  n_threads: number;
  n_gpu_layers: number;
  n_parallel: number;
  use_mlock: boolean;
  use_mmap: boolean;
  ctx_shift: boolean;
}

/** The parameters of llama.rn's completion that Sigil sets. */
export interface LlamaCompletionParams {
  messages: ChatMessage[];
  /** Use the Jinja chat template of the GGUF file; false falls back to llama.cpp's built in templates. */
  jinja: boolean;
  enable_thinking: boolean;
  response_format?: { type: 'json_schema'; json_schema: { strict: boolean; schema: object } };
  n_predict: number;
  temperature: number;
  top_k: number;
  top_p: number;
}

/** The fields of a llama.rn completion result that Sigil reads. */
export interface LlamaCompletionResult {
  text: string;
  content?: string;
  tool_calls?: { function: { name: string; arguments: string } }[];
  context_full?: boolean;
}

/** The part of a llama.rn LlamaContext that Sigil uses. */
export interface LlamaContextLike {
  completion(params: LlamaCompletionParams): Promise<LlamaCompletionResult>;
  stopCompletion(): Promise<void>;
  release(): Promise<void>;
  /** True when the GGUF file carries a Jinja chat template. */
  isJinjaSupported(): boolean;
}

/** The runtime port: llama.rn in the app, a fake in the tests. */
export interface LlamaRuntime {
  initLlama(params: LlamaInitParams, onProgress?: (percent: number) => void): Promise<LlamaContextLike>;
}

/** llama.rn, loaded on first use so Expo Go, the web and the tests never touch the native module. */
export function llamaRnRuntime(): LlamaRuntime {
  return {
    async initLlama(params, onProgress) {
      const llama = await import('llama.rn');
      return llama.initLlama(params, onProgress);
    },
  };
}

/** Context length in tokens. The prompt (system prompt and tools) plus the answer fit with room to spare. */
export const DEFAULT_CONTEXT_SIZE = 2048;

/** The weights are released after this long without a request. */
export const DEFAULT_IDLE_RELEASE_MS = 60_000;

/**
 * CPU threads for a phone with this many cores. Phones mix fast and slow
 * cores, and token generation is bound by memory bandwidth, so using about
 * half the cores (the fast cluster) and never more than four is faster and
 * cooler than using all of them; llama.rn pins the threads to the fastest
 * cores. Unknown core counts get four, which llama.rn caps to the hardware.
 */
export function threadCountFor(cores: number | null): number {
  if (cores === null || !Number.isFinite(cores) || cores < 1) return 4;
  if (cores <= 2) return 1;
  if (cores <= 4) return 2;
  return Math.min(4, Math.floor(cores / 2));
}

/** Drops "additionalProperties": false. llama.cpp's grammar already refuses unknown keys. */
function compactSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactSchema);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === 'additionalProperties' && item === false) continue;
      out[key] = compactSchema(item);
    }
    return out;
  }
  return value;
}

/**
 * A JSON schema that accepts exactly one call to one of the tools,
 * {"name": ..., "arguments": {...}}, with the arguments of that tool. llama.cpp
 * turns it into a grammar, so the model cannot answer anything else.
 */
export function toolCallSchema(tools: readonly ToolDefinition[]): object {
  return {
    oneOf: tools.map((tool) => ({
      type: 'object',
      properties: {
        name: { const: tool.function.name },
        arguments: compactSchema(tool.function.parameters),
      },
      required: ['name', 'arguments'],
    })),
  };
}

type PropertySchema = { type?: unknown; enum?: unknown; minimum?: unknown; maximum?: unknown; description?: unknown };

function describeType(schema: PropertySchema): string {
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  }
  const type = typeof schema.type === 'string' ? schema.type : 'string';
  if (typeof schema.minimum === 'number' && typeof schema.maximum === 'number') {
    return `${type} ${schema.minimum} to ${schema.maximum}`;
  }
  return type;
}

/**
 * One line per tool: send_message(contact: string, text: string, app?: string): description.
 * Required arguments come first, in the order the grammar expects them.
 */
export function describeTool(tool: ToolDefinition): string {
  const parameters = tool.function.parameters as { properties?: Record<string, PropertySchema>; required?: string[] };
  const required = new Set(parameters.required ?? []);
  const entries = Object.entries(parameters.properties ?? {});
  const ordered = [...entries.filter(([name]) => required.has(name)), ...entries.filter(([name]) => !required.has(name))];
  const signature = ordered.map(([name, schema]) => `${name}${required.has(name) ? '' : '?'}: ${describeType(schema)}`).join(', ');
  const notes = ordered
    .filter(([, schema]) => typeof schema.description === 'string')
    .map(([name, schema]) => ` ${name}: ${String(schema.description)}`)
    .join('');
  return `- ${tool.function.name}(${signature}): ${tool.function.description}${notes}`;
}

const toolListCache = new WeakMap<readonly ToolDefinition[], string>();

/** The tools as the model reads them, in the first system message. */
export function toolList(tools: readonly ToolDefinition[]): string {
  let list = toolListCache.get(tools);
  if (list === undefined) {
    list = ['Tools:', ...tools.map(describeTool), 'Answer with one JSON object: {"name": tool name, "arguments": {...}}.'].join('\n');
    toolListCache.set(tools, list);
  }
  return list;
}

/**
 * Appends the tool list to the first system message, which stays the same for
 * every request, so llama.cpp keeps it in the KV cache.
 */
function withToolList(messages: ChatMessage[], tools: readonly ToolDefinition[]): ChatMessage[] {
  const list = toolList(tools);
  const [first, ...rest] = messages;
  return first?.role === 'system'
    ? [{ role: 'system', content: `${first.content}\n${list}` }, ...rest]
    : [{ role: 'system', content: list }, ...messages];
}

/** Reads {"name": ..., "arguments": ...} from a constrained answer; empty when the text is something else. */
function parseCall(text: string): RawToolCall[] {
  try {
    const value = JSON.parse(text.trim()) as { name?: unknown; arguments?: unknown };
    return typeof value?.name === 'string' ? [{ name: value.name, arguments: value.arguments ?? {} }] : [];
  } catch {
    return [];
  }
}

export class ModelAbortError extends Error {
  constructor() {
    super('The model request was cancelled.');
    this.name = 'AbortError';
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new ModelAbortError();
  }
}

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'failed';

export interface LlamaEngineOptions {
  id: string;
  /** Path or file:// URI of the GGUF file. */
  modelPath: string;
  runtime: LlamaRuntime;
  /** Defaults to DEFAULT_CONTEXT_SIZE. */
  contextSize?: number;
  /** Defaults to threadCountFor(null). */
  threads?: number;
  /** Layers on the GPU: Metal on iOS. Android runs on the CPU. */
  gpuLayers?: number;
  /** Release the weights after this long without a request; 0 keeps them. Defaults to one minute. */
  idleReleaseMs?: number;
  /** Asked before every load; a reason refuses it, for example when the phone is low on memory. */
  canLoad?: () => string | null;
  onStatus?: (status: EngineStatus, error: string | null) => void;
}

/**
 * ChatEngine over llama.rn (llama.cpp). It loads the GGUF file lazily, on the
 * first prepare or request, runs one operation at a time, constrains the
 * answer to exactly one tool call with a JSON schema grammar, and releases
 * the weights when told to (background, memory pressure) or after a minute
 * idle.
 */
export class LlamaChatEngine implements ChatEngine {
  readonly id: string;
  private context: LlamaContextLike | null = null;
  /** True once the system prompt and the tools are in the KV cache. */
  private warmed = false;
  private generating = false;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private statusValue: EngineStatus = 'idle';
  private errorValue: string | null = null;

  constructor(private readonly options: LlamaEngineOptions) {
    this.id = options.id;
  }

  get status(): EngineStatus {
    return this.statusValue;
  }

  /** Why the last load or request failed, in English, or null. */
  get error(): string | null {
    return this.errorValue;
  }

  isReady(): boolean {
    return this.context !== null && this.warmed && this.statusValue === 'ready';
  }

  prepare(warmUp: ChatRequest): void {
    this.cancelIdleRelease();
    this.exclusive(async () => {
      const context = await this.load();
      if (!this.warmed) {
        try {
          // n_predict 0 evaluates the prompt into the cache and generates nothing.
          await context.completion({ ...this.params(warmUp, context), n_predict: 0 });
          this.warmed = true;
        } catch {
          // A failed warm up only costs speed: the first request evaluates the whole prompt.
          this.warmed = true;
        }
      }
      this.setStatus('ready', null);
    })
      .catch(() => undefined)
      .finally(() => this.scheduleIdleRelease());
  }

  async complete(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
    this.cancelIdleRelease();
    try {
      return await this.exclusive(async () => {
        throwIfAborted(signal);
        const context = await this.load();
        this.setStatus('ready', null);
        throwIfAborted(signal);
        const stop = () => {
          context.stopCompletion().catch(() => undefined);
        };
        signal?.addEventListener('abort', stop);
        this.generating = true;
        try {
          const result = await context.completion(this.params(request, context));
          throwIfAborted(signal);
          if (result.context_full) {
            throw new Error('The request does not fit the model context.');
          }
          this.warmed = true;
          const text = result.content || result.text || '';
          const toolCalls: RawToolCall[] = result.tool_calls?.length
            ? result.tool_calls.map((call) => ({ name: call.function.name, arguments: call.function.arguments }))
            : parseCall(text);
          return { text, toolCalls };
        } finally {
          this.generating = false;
          signal?.removeEventListener('abort', stop);
        }
      });
    } finally {
      this.scheduleIdleRelease();
    }
  }

  /** Stops a running generation, then frees the weights and the cache. The next request loads them again. */
  async release(): Promise<void> {
    this.cancelIdleRelease();
    if (this.generating && this.context) {
      await this.context.stopCompletion().catch(() => undefined);
    }
    await this.exclusive(async () => {
      const context = this.context;
      this.context = null;
      this.warmed = false;
      if (context) {
        await context.release().catch(() => undefined);
      }
      if (this.statusValue !== 'failed') {
        this.setStatus('idle', null);
      }
    });
  }

  private async load(): Promise<LlamaContextLike> {
    if (this.context) {
      return this.context;
    }
    const refusal = this.options.canLoad?.() ?? null;
    if (refusal) {
      this.setStatus('failed', refusal);
      throw new Error(refusal);
    }
    this.setStatus('loading', null);
    try {
      this.context = await this.options.runtime.initLlama({
        model: this.options.modelPath,
        n_ctx: this.options.contextSize ?? DEFAULT_CONTEXT_SIZE,
        n_batch: 512,
        n_ubatch: 256,
        n_threads: this.options.threads ?? threadCountFor(null),
        n_gpu_layers: this.options.gpuLayers ?? 0,
        n_parallel: 1,
        use_mlock: false,
        use_mmap: true,
        ctx_shift: false,
      });
      this.warmed = false;
      return this.context;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setStatus('failed', message);
      throw error instanceof Error ? error : new Error(message);
    }
  }

  /**
   * The messages go through the model's own chat template (the Jinja template
   * in the GGUF file, or llama.cpp's built in one), with the tools listed
   * compactly in the first system message. The tool definitions rendered as
   * JSON by the template would take about 2,200 tokens, more than the whole
   * context; the list takes about a third. A required tool choice becomes a
   * JSON schema, which llama.cpp turns into a grammar, so the model can only
   * answer with one valid call.
   */
  private params(request: ChatRequest, context: LlamaContextLike): LlamaCompletionParams {
    const constrained = request.toolChoice === 'required';
    return {
      messages: withToolList(request.messages, request.tools),
      jinja: context.isJinjaSupported(),
      enable_thinking: false,
      ...(constrained
        ? { response_format: { type: 'json_schema' as const, json_schema: { strict: true, schema: toolCallSchema(request.tools) } } }
        : {}),
      n_predict: request.maxTokens,
      temperature: request.temperature,
      top_k: 40,
      top_p: 0.95,
    };
  }

  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private scheduleIdleRelease(): void {
    const ms = this.options.idleReleaseMs ?? DEFAULT_IDLE_RELEASE_MS;
    if (ms <= 0 || this.context === null) return;
    this.cancelIdleRelease();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      void this.release();
    }, ms);
  }

  private cancelIdleRelease(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private setStatus(status: EngineStatus, error: string | null): void {
    if (status === this.statusValue && error === this.errorValue) return;
    this.statusValue = status;
    this.errorValue = error;
    this.options.onStatus?.(status, error);
  }
}
