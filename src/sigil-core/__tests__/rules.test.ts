import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner, cleanRequest, parseRequest } from '..';

const apps = new ActionPlanner({ profiles: ProfileRegistry.withBuiltins() }).knownApps();

function parse(text: string) {
  const match = parseRequest(text, apps);
  return match ? { tool: match.tool, args: match.args } : null;
}

describe('cleanRequest', () => {
  it('drops wake words, polite prefixes and final punctuation', () => {
    expect(cleanRequest('Hey Sigil, please open YouTube!')).toBe('open YouTube');
    expect(cleanRequest('ok sigil pode abrir o zap por favor.')).toBe('abrir o zap');
    expect(cleanRequest('  can you   scroll   down? ')).toBe('scroll down');
  });

  it('turns curly quotes into straight ones', () => {
    expect(cleanRequest('send “hi” to Ana')).toBe('send "hi" to Ana');
  });
});

describe('parseRequest in English', () => {
  it.each([
    ['send a message to Ana on WhatsApp saying I am on my way', { app: 'WhatsApp', contact: 'Ana', text: 'I am on my way' }],
    ['message Ana on whatsapp: running late', { app: 'whatsapp', contact: 'Ana', text: 'running late' }],
    ['tell my mom that dinner is ready', { contact: 'mom', text: 'dinner is ready' }],
    ['text Bruno saying see you at 8 on Messages', { app: 'Messages', contact: 'Bruno', text: 'see you at 8' }],
    ["send I'm outside to Carla on WhatsApp", { app: 'WhatsApp', contact: 'Carla', text: "I'm outside" }],
    ['send "on my way" to Dani', { contact: 'Dani', text: 'on my way' }],
  ])('reads "%s" as a message', (text, args) => {
    expect(parse(text)).toEqual({ tool: 'send_message', args });
  });

  it('keeps the original casing and words of the message', () => {
    expect(parse('send a message to Ana on WhatsApp saying Great NEWS on Monday')?.args.text).toBe('Great NEWS on Monday');
  });

  it('asks what to write when a message has no text', () => {
    expect(parse('send a message to Ana on WhatsApp')).toEqual({
      tool: 'clarify',
      args: { question: 'What should the message to Ana say?' },
    });
  });

  it.each([
    ['open YouTube', { app: 'YouTube' }],
    ['launch the instagram app', { app: 'instagram' }],
    ['go to settings', { app: 'settings' }],
    ['open calculator', { app: 'calculator' }],
  ])('reads "%s" as opening an app', (text, args) => {
    expect(parse(text)).toEqual({ tool: 'open_app', args });
  });

  it.each([
    ['search for lofi beats on YouTube', { tool: 'search', args: { query: 'lofi beats', app: 'YouTube' } }],
    ['play never gonna give you up on youtube', { tool: 'search', args: { app: 'youtube', query: 'never gonna give you up' } }],
    ['google weather tomorrow', { tool: 'search', args: { query: 'weather tomorrow' } }],
    ['scroll down', { tool: 'scroll', args: { direction: 'down' } }],
    ['swipe left', { tool: 'scroll', args: { direction: 'left' } }],
    ['go back', { tool: 'navigate', args: { action: 'back' } }],
    ['go home', { tool: 'navigate', args: { action: 'home' } }],
    ['show recent apps', { tool: 'navigate', args: { action: 'recents' } }],
    ['open notifications', { tool: 'navigate', args: { action: 'notifications' } }],
    ['take a screenshot', { tool: 'navigate', args: { action: 'screenshot' } }],
    ['lock the screen', { tool: 'navigate', args: { action: 'lock_screen' } }],
    ['pause the video', { tool: 'media', args: { action: 'pause' } }],
    ['play pause', { tool: 'media', args: { action: 'play_pause' } }],
    ['next song', { tool: 'media', args: { action: 'next' } }],
    ['tap the Follow button', { tool: 'tap', args: { label: 'Follow' } }],
    ['type hello world', { tool: 'type_text', args: { text: 'hello world' } }],
    ['post sunset at the beach on Instagram', { tool: 'create_post', args: { app: 'Instagram', caption: 'sunset at the beach' } }],
  ])('reads "%s"', (text, expected) => {
    expect(parse(text)).toEqual(expected);
  });
});

describe('parseRequest in Brazilian Portuguese', () => {
  it.each([
    ['manda uma mensagem pra mãe no zap dizendo que estou chegando', { app: 'zap', contact: 'mãe', text: 'estou chegando' }],
    ['envie para o João pelo WhatsApp: já saí de casa', { app: 'WhatsApp', contact: 'João', text: 'já saí de casa' }],
    ['diz pra Ana que vou atrasar', { contact: 'Ana', text: 'vou atrasar' }],
    ['manda pro Pedro dizendo bom dia no whatsapp', { app: 'whatsapp', contact: 'Pedro', text: 'bom dia' }],
  ])('reads "%s" as a message', (text, args) => {
    expect(parse(text)).toEqual({ tool: 'send_message', args });
  });

  it.each([
    ['abre o YouTube', { tool: 'open_app', args: { app: 'YouTube' } }],
    ['abrir configurações', { tool: 'open_app', args: { app: 'configurações' } }],
    ['pesquisa receita de bolo no YouTube', { tool: 'search', args: { query: 'receita de bolo', app: 'YouTube' } }],
    ['toca Legião Urbana no YouTube', { tool: 'search', args: { app: 'YouTube', query: 'Legião Urbana' } }],
    ['rolar para baixo', { tool: 'scroll', args: { direction: 'down' } }],
    ['sobe', { tool: 'scroll', args: { direction: 'up' } }],
    ['voltar', { tool: 'navigate', args: { action: 'back' } }],
    ['tela inicial', { tool: 'navigate', args: { action: 'home' } }],
    ['abrir as notificações', { tool: 'navigate', args: { action: 'notifications' } }],
    ['tira um print', { tool: 'navigate', args: { action: 'screenshot' } }],
    ['pausa', { tool: 'media', args: { action: 'pause' } }],
    ['próxima música', { tool: 'media', args: { action: 'next' } }],
    ['toque em Seguir', { tool: 'tap', args: { label: 'Seguir' } }],
    ['digita bom dia', { tool: 'type_text', args: { text: 'bom dia' } }],
    ['postar pôr do sol no Instagram', { tool: 'create_post', args: { app: 'Instagram', caption: 'pôr do sol' } }],
  ])('reads "%s"', (text, expected) => {
    expect(parse(text)).toEqual(expected);
  });

  it('asks what to write when a message has no text', () => {
    expect(parse('manda uma mensagem para a Bia no zap')?.tool).toBe('clarify');
  });
});

describe('parseRequest limits', () => {
  it('returns null for requests it does not cover', () => {
    expect(parse('what is the meaning of life')).toBeNull();
    expect(parse('')).toBeNull();
  });

  it('only accepts known apps after "on"', () => {
    // Without a known app the whole tail stays part of the message.
    expect(parse('tell Ana that the party is on Friday')).toEqual({
      tool: 'send_message',
      args: { contact: 'Ana', text: 'the party is on Friday' },
    });
  });
});
