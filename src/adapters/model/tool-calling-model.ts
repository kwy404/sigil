import type { LanguageModel, ModelContext, ModelReply } from '../../sigil-core/model';
import type { RawToolCall, ToolDefinition } from '../../sigil-core/tools';
import type { ChatEngine, ChatMessage, ChatRequest } from './chat-engine';

export interface ToolCallingModelOptions {
  temperature?: number;
  maxTokens?: number;
}

/** App names once each, ignoring case: "WhatsApp" and "whatsapp" are one name to the model. */
function uniqueNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Messages for small instruction tuned models. Short on purpose: every token
 * costs time on a phone. The first system message (and the tool list an
 * engine adds to it) never changes between requests, so the runtime keeps it
 * in its KV cache and evaluates only the short context note and the request.
 * Anything that varies comes after it.
 */
export function buildMessages(request: string, context: ModelContext): ChatMessage[] {
  const system = [
    'You are Sigil, a hands free phone companion. Turn the user request into exactly one tool call.',
    'Rules:',
    '- Call one tool only. If the request needs several actions, call the first one.',
    '- Use clarify when the request is ambiguous or misses a contact, an app or a message text.',
    '- Never invent contacts, messages or captions. Copy them from the request, in the language the user used.',
    '- One contact per message. Sigil applies its own safety rules after you, so just pick the tool.',
    `Known apps: ${uniqueNames(context.knownApps).join(', ')}.`,
  ].join('\n');
  const note = `App on screen: ${context.foregroundApp ?? 'unknown'}. Request language: ${context.locale}.`;
  return [
    { role: 'system', content: system },
    { role: 'system', content: note },
    { role: 'user', content: request },
  ];
}

function findJsonObjects(text: string): string[] {
  const objects: string[] = [];
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          objects.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return objects;
}

/**
 * Small models often print the tool call as JSON instead of using the tool
 * call channel, sometimes wrapped in tags such as <tool_call>. This recovers
 * the first object that looks like a call.
 */
export function extractToolCallsFromText(text: string): RawToolCall[] {
  for (const candidate of findJsonObjects(text)) {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>;
      const name = value.name ?? (value.function as Record<string, unknown> | undefined)?.name;
      const args = value.arguments ?? value.parameters ?? (value.function as Record<string, unknown> | undefined)?.arguments;
      if (typeof name === 'string') {
        return [{ name, arguments: args ?? {} }];
      }
    } catch {
      // Not valid JSON, try the next object.
    }
  }
  return [];
}

/**
 * LanguageModel backed by an on device chat engine with tool calling. The
 * engine is looked up on every call so the weights can be loaded lazily and
 * released when idle; the getter returns null while no model is installed.
 */
export class ToolCallingModel implements LanguageModel {
  readonly kind = 'local' as const;

  constructor(
    readonly id: string,
    private readonly engine: () => ChatEngine | null,
    private readonly options: ToolCallingModelOptions = {},
  ) {}

  /** True when an engine is installed and its weights are loaded. */
  isReady(): boolean {
    const engine = this.engine();
    return engine !== null && (engine.isReady?.() ?? true);
  }

  /** Loads the weights and caches the system prompt and the tools, without a request. */
  prepare(context: ModelContext, tools: readonly ToolDefinition[]): void {
    this.engine()?.prepare?.(this.request('', context, tools));
  }

  async propose(
    request: string,
    context: ModelContext,
    tools: readonly ToolDefinition[],
    signal?: AbortSignal,
  ): Promise<ModelReply> {
    const engine = this.engine();
    if (!engine) {
      throw new Error(`${this.id} is not loaded.`);
    }
    const response = await engine.complete(this.request(request, context, tools), signal);
    const toolCalls = response.toolCalls.length > 0 ? response.toolCalls : extractToolCallsFromText(response.text);
    return { toolCalls, text: response.text };
  }

  private request(text: string, context: ModelContext, tools: readonly ToolDefinition[]): ChatRequest {
    return {
      messages: buildMessages(text, context),
      tools,
      toolChoice: 'required',
      temperature: this.options.temperature ?? 0.1,
      maxTokens: this.options.maxTokens ?? 200,
    };
  }
}
