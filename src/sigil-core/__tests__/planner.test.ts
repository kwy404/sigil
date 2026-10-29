import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import {
  ActionPlanner,
  ConfirmationPolicy,
  isSensitiveLabel,
  parseToolCall,
  toolDefinitions,
  type LanguageModel,
  type ModelReply,
  type PlanOutcome,
  type PlanStep,
} from '..';

const profiles = ProfileRegistry.withBuiltins();
const planner = new ActionPlanner({ profiles });

function planned(outcome: PlanOutcome) {
  if (outcome.status !== 'planned') {
    throw new Error(`Expected a plan, got ${outcome.status}: ${'message' in outcome ? outcome.message : ''}`);
  }
  return outcome.plan;
}

function kinds(steps: PlanStep[]): string[] {
  return steps.map((s) => s.kind);
}

class ScriptedModel implements LanguageModel {
  readonly id = 'scripted';
  readonly kind = 'mock' as const;
  calls = 0;

  constructor(
    private readonly reply: ModelReply | (() => Promise<ModelReply>),
    private readonly ready = true,
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  async propose(): Promise<ModelReply> {
    this.calls++;
    return typeof this.reply === 'function' ? this.reply() : this.reply;
  }
}

describe('ActionPlanner with the rule based fallback', () => {
  it('plans a WhatsApp message as a chain of steps that stops for confirmation before sending', async () => {
    const plan = planned(await planner.plan({ text: 'send a message to Ana on WhatsApp saying I am on my way' }));
    expect(plan.source).toBe('rules');
    expect(plan.summary).toBe('Send "I am on my way" to Ana on WhatsApp');
    expect(plan.needsConfirmation).toBe(true);
    expect(kinds(plan.steps)).toEqual(['open_app', 'wait', 'tap', 'type', 'find', 'tap', 'find', 'type', 'confirm', 'tap']);
    expect(plan.steps[0]).toMatchObject({ kind: 'open_app', app: 'whatsapp', packageName: 'com.whatsapp' });
    expect(plan.steps[3]).toMatchObject({ kind: 'type', text: 'Ana' });
    expect(plan.steps[8]).toEqual({ kind: 'confirm', summary: 'Send "I am on my way" to Ana on WhatsApp?', reason: 'send' });
    expect(plan.steps[9]).toEqual({ kind: 'tap', target: { by: 'selector', app: 'whatsapp', name: 'send' }, commit: true });
  });

  it('plans the same message from Portuguese and uses the default messaging app', async () => {
    const plan = planned(await planner.plan({ text: 'diz pra mãe que estou chegando', locale: 'pt-BR' }));
    expect(plan.intent).toEqual({ tool: 'send_message', args: { contact: 'mãe', text: 'estou chegando' } });
    expect(plan.steps[0]).toMatchObject({ app: 'whatsapp' });
    expect(plan.steps.filter((s) => s.kind === 'confirm')).toHaveLength(1);
  });

  it('uses the start chat flow in Messages', async () => {
    const plan = planned(await planner.plan({ text: 'text Bruno saying see you soon on Messages' }));
    expect(plan.steps[2]).toEqual({
      kind: 'tap',
      target: { by: 'selector', app: 'messages', name: 'startChat' },
      commit: false,
    });
    expect(plan.steps[3]).toMatchObject({ kind: 'type', target: { by: 'selector', name: 'recipientInput' } });
  });

  it('opens search results through the app link when there is one', async () => {
    const plan = planned(await planner.plan({ text: 'search for lofi beats on YouTube' }));
    expect(kinds(plan.steps)).toEqual(['open_app', 'wait']);
    expect(plan.steps[0]).toMatchObject({
      url: 'https://www.youtube.com/results?search_query=lofi%20beats',
      packageName: 'com.google.android.youtube',
    });
    expect(plan.needsConfirmation).toBe(false);
  });

  it('searches the web in Chrome when no app is named', async () => {
    const plan = planned(await planner.plan({ text: 'google weather in São Paulo' }));
    expect(plan.steps[0]).toMatchObject({ app: 'chrome', url: 'https://www.google.com/search?q=weather%20in%20S%C3%A3o%20Paulo' });
  });

  it('types into the search field of apps without a search link', async () => {
    const plan = planned(await planner.plan({ text: 'search for cats on TikTok' }));
    expect(plan.steps.slice(2)).toEqual([
      { kind: 'tap', target: { by: 'selector', app: 'tiktok', name: 'search' }, commit: false },
      { kind: 'type', text: 'cats', target: { by: 'focused' }, submit: true },
    ]);
  });

  it('opens apps that have no profile by their label', async () => {
    const plan = planned(await planner.plan({ text: 'open Foobar Notes' }));
    expect(plan.steps).toEqual([{ kind: 'open_app', app: 'Foobar Notes', label: 'Foobar Notes' }]);
  });

  it('opens the default app of a kind by its role', async () => {
    const plan = planned(await planner.plan({ text: 'open calculator' }));
    expect(plan.steps).toEqual([{ kind: 'open_app', app: 'role:calculator', label: 'calculator', role: 'calculator' }]);
  });

  it('plans single step requests', async () => {
    expect(planned(await planner.plan({ text: 'scroll down' })).steps).toEqual([{ kind: 'scroll', direction: 'down' }]);
    expect(planned(await planner.plan({ text: 'voltar' })).steps).toEqual([{ kind: 'navigate', action: 'back' }]);
    expect(planned(await planner.plan({ text: 'pause' })).steps).toEqual([{ kind: 'media', action: 'pause' }]);
  });

  it('asks for confirmation before tapping a control that sends or buys', async () => {
    const plan = planned(await planner.plan({ text: 'tap Buy now' }));
    expect(kinds(plan.steps)).toEqual(['find', 'confirm', 'tap']);
    expect(plan.needsConfirmation).toBe(true);
    const harmless = planned(await planner.plan({ text: 'tap Follow' }));
    expect(kinds(harmless.steps)).toEqual(['find', 'tap']);
  });

  it('treats every planned tap inside Settings as a change to confirm', async () => {
    const plan = planned(await planner.plan({ text: 'tap Wi-Fi', foregroundPackage: 'com.android.settings' }));
    expect(kinds(plan.steps)).toEqual(['find', 'confirm', 'tap']);
  });

  it('stops an Instagram post for confirmation before Share and lets the user pick the media', async () => {
    const plan = planned(await planner.plan({ text: 'post sunset at the beach on Instagram' }));
    expect(kinds(plan.steps)).toEqual(['open_app', 'wait', 'tap', 'wait', 'tap', 'type', 'confirm', 'tap']);
    expect(plan.steps[3]).toMatchObject({ kind: 'wait', timeoutMs: 180000 });
    expect(plan.steps[6]).toMatchObject({ kind: 'confirm', reason: 'post' });
  });

  it('asks a question when the request is incomplete', async () => {
    expect(await planner.plan({ text: 'send a message to Ana' })).toEqual({
      status: 'clarify',
      question: 'What should the message to Ana say?',
      source: 'rules',
    });
  });

  it('refuses bulk and repeated actions', async () => {
    for (const text of [
      'send happy new year to all my contacts on WhatsApp',
      'manda bom dia pra todo mundo no zap',
      'like all posts on Instagram',
      'curtir todas as fotos dela',
      'send hi to Ana 50 times',
      'open YouTube every hour',
    ]) {
      expect((await planner.plan({ text })).status).toBe('blocked');
    }
  });

  it('refuses one message to several people', async () => {
    const outcome = await planner.plan({ text: 'send hi to Ana and Bruno on WhatsApp' });
    expect(outcome).toEqual({
      status: 'blocked',
      message: 'Sigil sends a message to one person at a time. Ask again for each person.',
      notice: { code: 'several_people' },
    });
  });

  it('explains what it cannot do yet', async () => {
    const outcome = await planner.plan({ text: 'post hello on TikTok' });
    expect(outcome).toMatchObject({
      status: 'unsupported',
      message: 'Sigil cannot post on TikTok yet.',
      notice: { code: 'cannot_post', app: 'TikTok', appId: 'tiktok' },
    });
    const unsupported = await planner.plan({ text: 'search for cats on Settings' });
    expect(unsupported.status).toBe('planned');
    const noMessaging = await planner.plan({ text: 'send hi to Ana on YouTube' });
    expect(noMessaging).toMatchObject({ status: 'unsupported', message: 'Sigil cannot send messages in YouTube yet.' });
  });

  it('says when it did not understand', async () => {
    expect((await planner.plan({ text: 'what is the meaning of life' })).status).toBe('not_understood');
    expect((await planner.plan({ text: '   ' })).status).toBe('not_understood');
  });
});

describe('ActionPlanner with a language model', () => {
  it('uses a valid tool call from the model', async () => {
    const model = new ScriptedModel({
      toolCalls: [{ name: 'send_message', arguments: '{"app":"WhatsApp","contact":"Ana","text":"oi"}' }],
    });
    const plan = planned(await new ActionPlanner({ profiles, model }).plan({ text: 'please let Ana know I said hi' }));
    expect(plan.source).toBe('model');
    expect(plan.needsConfirmation).toBe(true);
  });

  it('runs only the first of several tool calls and says so', async () => {
    const model = new ScriptedModel({
      toolCalls: [
        { name: 'open_app', arguments: { app: 'YouTube' } },
        { name: 'send_message', arguments: { contact: 'Ana', text: 'oi' } },
      ],
    });
    const outcome = await new ActionPlanner({ profiles, model }).plan({ text: 'open youtube and message Ana' });
    expect(outcome.status).toBe('planned');
    if (outcome.status === 'planned') {
      expect(outcome.plan.intent.tool).toBe('open_app');
      expect(outcome.notes[0]).toContain('2 actions');
    }
  });

  it('falls back to the rules when the model calls an unknown tool', async () => {
    const model = new ScriptedModel({ toolCalls: [{ name: 'delete_account', arguments: {} }] });
    const outcome = await new ActionPlanner({ profiles, model }).plan({ text: 'open YouTube' });
    expect(outcome.status).toBe('planned');
    if (outcome.status === 'planned') {
      expect(outcome.plan.source).toBe('rules');
      expect(outcome.notes.join(' ')).toContain('Unknown tool "delete_account"');
    }
  });

  it('falls back to the rules when the model is slow or fails', async () => {
    const slow = new ScriptedModel(() => new Promise<ModelReply>(() => {}));
    const outcome = await new ActionPlanner({ profiles, model: slow, modelTimeoutMs: 20 }).plan({ text: 'go home' });
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('rules');

    const broken = new ScriptedModel(() => Promise.reject(new Error('out of memory')));
    const second = await new ActionPlanner({ profiles, model: broken }).plan({ text: 'go home' });
    expect(second.status === 'planned' && second.notes[0]).toBe('Model unavailable: out of memory');
  });

  it('does not wait for a model that is still loading', async () => {
    const loading = new ScriptedModel({ toolCalls: [] }, false);
    const outcome = await new ActionPlanner({ profiles, model: loading }).plan({ text: 'go home' });
    expect(loading.calls).toBe(0);
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('rules');
  });

  it('applies the same safety rules to model output', async () => {
    const model = new ScriptedModel({
      toolCalls: [{ name: 'send_message', arguments: { app: 'WhatsApp', contact: 'Ana, Bruno, Carla', text: 'promo' } }],
    });
    expect((await new ActionPlanner({ profiles, model }).plan({ text: 'tell my friends about the promo' })).status).toBe(
      'blocked',
    );
  });
});

describe('ActionPlanner with system controls', () => {
  async function fromModel(name: string, args: Record<string, unknown>, foregroundPackage?: string) {
    const model = new ScriptedModel({ toolCalls: [{ name, arguments: args }] });
    return new ActionPlanner({ profiles, model }).plan({ text: 'request', foregroundPackage });
  }

  it('plans volume, brightness, media, seek and speed as single steps that need no confirmation', async () => {
    const cases: [string, Record<string, unknown>, PlanStep][] = [
      ['volume', { action: 'set', level: 30 }, { kind: 'volume', stream: 'media', action: 'set', level: 30 }],
      ['volume', { action: 'mute', stream: 'ring' }, { kind: 'volume', stream: 'ring', action: 'mute' }],
      ['brightness', { action: 'down' }, { kind: 'brightness', action: 'down' }],
      ['media', { action: 'pause' }, { kind: 'media', action: 'pause' }],
      ['seek', { direction: 'back', seconds: 15 }, { kind: 'seek', seconds: -15 }],
      ['playback_speed', { rate: 1.5 }, { kind: 'speed', rate: 1.5 }],
      ['navigate', { action: 'power_menu' }, { kind: 'navigate', action: 'power_menu' }],
      ['settings_panel', { panel: 'bluetooth' }, { kind: 'panel', panel: 'bluetooth' }],
      ['control_sphere', { action: 'open' }, { kind: 'sphere', action: 'open' }],
    ];
    for (const [name, args, step] of cases) {
      const plan = planned(await fromModel(name, args));
      expect(plan.steps).toEqual([step]);
      expect(plan.needsConfirmation).toBe(false);
    }
  });

  it('rejects a volume level without set and set without a level', () => {
    expect(parseToolCall({ name: 'volume', arguments: { action: 'up', level: 40 } }).ok).toBe(false);
    expect(parseToolCall({ name: 'brightness', arguments: { action: 'set' } }).ok).toBe(false);
    expect(parseToolCall({ name: 'volume', arguments: { action: 'set', level: 140 } }).ok).toBe(false);
  });

  it('likes the post on screen through the app selector, without a confirmation', async () => {
    const plan = planned(await fromModel('like', {}, 'com.instagram.android'));
    expect(plan.steps).toEqual([
      { kind: 'find', target: { by: 'selector', app: 'instagram', name: 'like' }, scroll: false, timeoutMs: 3000 },
      { kind: 'tap', target: { by: 'selector', app: 'instagram', name: 'like' }, commit: false },
    ]);
    expect(plan.needsConfirmation).toBe(false);
    expect((await fromModel('like', {})).status).toBe('unsupported');
    expect((await fromModel('like', { app: 'Chrome' })).status).toBe('unsupported');
  });
});

describe('tool definitions', () => {
  it('describe the fixed set of intents as JSON schema function tools', () => {
    const tools = toolDefinitions();
    expect(tools.map((t) => t.function.name)).toEqual([
      'open_app',
      'close_app',
      'close_all_apps',
      'open_place',
      'open_chat',
      'set_timer',
      'set_alarm',
      'flashlight',
      'open_website',
      'open_tutorial',
      'send_message',
      'search',
      'scroll',
      'navigate',
      'tap',
      'type_text',
      'media',
      'seek',
      'playback_speed',
      'like',
      'volume',
      'brightness',
      'settings_panel',
      'control_sphere',
      'create_post',
      'clarify',
    ]);
    const send = tools.find((t) => t.function.name === 'send_message')!;
    expect(send.function.parameters).toMatchObject({
      type: 'object',
      required: ['contact', 'text'],
      additionalProperties: false,
    });
    expect(send.function.parameters).not.toHaveProperty('$schema');
  });

  it('validate raw tool calls', () => {
    expect(parseToolCall({ name: 'scroll', arguments: { direction: 'down' } })).toEqual({
      ok: true,
      intent: { tool: 'scroll', args: { direction: 'down' } },
    });
    expect(parseToolCall({ name: 'scroll', arguments: { direction: 'sideways' } }).ok).toBe(false);
    expect(parseToolCall({ name: 'scroll', arguments: '{not json' }).ok).toBe(false);
    expect(parseToolCall({ name: 'open_app', arguments: { app: 'YouTube', extra: true } }).ok).toBe(false);
  });
});

describe('ConfirmationPolicy', () => {
  const policy = new ConfirmationPolicy(profiles);

  it('recognizes sensitive labels in English and Portuguese', () => {
    expect(isSensitiveLabel('Send')).toBe(true);
    expect(isSensitiveLabel('Publicar agora')).toBe(true);
    expect(isSensitiveLabel('Comprar')).toBe(true);
    expect(isSensitiveLabel('Search')).toBe(false);
  });

  it('inserts a confirmation before an unguarded commit', () => {
    const result = policy.apply([{ kind: 'tap', target: { by: 'selector', app: 'whatsapp', name: 'send' }, commit: false }]);
    expect(result.ok && result.steps.map((s) => s.kind)).toEqual(['confirm', 'tap']);
    expect(result.ok && result.steps[1]).toMatchObject({ commit: true });
  });

  it('refuses plans with more commits than allowed', () => {
    const send: PlanStep = { kind: 'tap', target: { by: 'text', value: 'Send' }, commit: true };
    expect(policy.apply([send, send]).ok).toBe(false);
    expect(new ConfirmationPolicy(profiles, { maxCommitsPerPlan: 2 }).apply([send, send]).ok).toBe(true);
  });

  it('finds unguarded commits in plans built by hand', () => {
    expect(policy.check([{ kind: 'tap', target: { by: 'description', value: 'Share' }, commit: false }])).toContain(
      'without a confirmation',
    );
    expect(policy.check([{ kind: 'scroll', direction: 'down' }])).toBeNull();
  });
});
