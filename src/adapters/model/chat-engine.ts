import type { RawToolCall, ToolDefinition } from '../../sigil-core/tools';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools: readonly ToolDefinition[];
  /** required asks the chat template to force a tool call when it supports that. */
  toolChoice: 'auto' | 'required';
  temperature: number;
  maxTokens: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: RawToolCall[];
}

/**
 * The small chat completion surface Sigil needs from an on device runtime.
 * llama.rn exposes a context whose completion call takes messages, tools and
 * sampling options and returns text plus parsed tool calls; an adapter only has
 * to map field names. react-native-executorch and MLC fit the same shape.
 */
export interface ChatEngine {
  readonly id: string;
  complete(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>;
  /** Frees the weights and the KV cache. */
  release?(): Promise<void>;
}
