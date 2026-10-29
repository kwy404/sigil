import { RuleBasedModel } from '../../sigil-core/model';
import type { ChatEngine, ChatRequest, ChatResponse } from './chat-engine';

/**
 * Chat engine stand in. It answers with the rule parser's tool call so the
 * whole model path (prompt, tool call parsing, validation) runs in development
 * builds and tests before a real runtime is installed.
 */
export class MockChatEngine implements ChatEngine {
  readonly id = 'mock-chat';
  readonly requests: ChatRequest[] = [];
  private readonly rules = new RuleBasedModel();

  constructor(private readonly knownApps: readonly string[] = []) {}

  async complete(request: ChatRequest): Promise<ChatResponse> {
    this.requests.push(request);
    const user = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const reply = await this.rules.propose(user, { locale: 'en-US', foregroundApp: null, knownApps: [...this.knownApps] });
    return {
      text: '',
      toolCalls: reply.toolCalls.map((call) => ({ name: call.name, arguments: JSON.stringify(call.arguments) })),
    };
  }
}
