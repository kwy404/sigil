import { parseRequest } from './rules';
import type { RawToolCall, ToolDefinition } from './tools';

/** What the planner tells a model about the moment of the request. */
export interface ModelContext {
  /** BCP 47 locale of the request, for example en-US or pt-BR. */
  locale: string;
  /** Name of the app in the foreground, when known. */
  foregroundApp: string | null;
  /** App names Sigil can open: installed apps, profiles and well known apps with their nicknames. */
  knownApps: string[];
}

export interface ModelReply {
  /** Tool calls in the order the model produced them. Sigil runs only the first. */
  toolCalls: RawToolCall[];
  /** Free text the model produced, if any. */
  text?: string;
}

/**
 * A language model that turns a request into a call to one of the fixed intent
 * tools. Implementations: RuleBasedModel (deterministic, always available) and
 * the on device model adapters in src/adapters/model.
 */
export interface LanguageModel {
  readonly id: string;
  readonly kind: 'rules' | 'local' | 'mock';
  /** False while weights are downloading or loading. The planner then uses the fallback. */
  isReady(): boolean;
  /** Aborting the signal must stop the work: the planner aborts it when the model runs out of time. */
  propose(request: string, context: ModelContext, tools: readonly ToolDefinition[], signal?: AbortSignal): Promise<ModelReply>;
  /**
   * Optional: starts loading the weights in the background, so a later
   * request finds the model ready. Called by the planner when the model is not
   * ready yet, and by screens when the user starts to speak.
   */
  prepare?(context: ModelContext, tools: readonly ToolDefinition[]): void;
}

/** Deterministic fallback built on the rule parser. Same input, same output, no weights. */
export class RuleBasedModel implements LanguageModel {
  readonly id = 'rules';
  readonly kind = 'rules' as const;

  isReady(): boolean {
    return true;
  }

  async propose(request: string, context: ModelContext): Promise<ModelReply> {
    const match = parseRequest(request, context.knownApps, context.locale);
    if (!match) {
      return { toolCalls: [] };
    }
    return { toolCalls: [{ name: match.tool, arguments: match.args }] };
  }
}
