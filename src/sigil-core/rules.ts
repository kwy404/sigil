/**
 * Deterministic parser for voice requests in English and Brazilian Portuguese.
 * It is the fallback when no language model is loaded, and it produces the
 * same intent tool calls a model would.
 */
import type { ToolName } from './tools';

export interface RuleMatch {
  tool: ToolName;
  args: Record<string, string>;
  /** Id of the rule that matched. */
  rule: string;
}

type Groups = Record<string, string | undefined>;

interface Rule {
  id: string;
  tool: ToolName;
  /** Regular expression source. APPS is replaced with the known app names. */
  source: string;
  build: (g: Groups) => Record<string, string> | null;
}

const EN_SEND_VERB = '(?:send|text|message|tell|write)';
const PT_SEND_VERB = '(?:mand[ae]r?|envi[ae]r?|escrev[ae]r?|escreve)';
const PT_TO = '(?:para|pra|pro|ao|à|a)';
const PT_ON = '(?:no|na|pelo|pela|via)';
const EN_ON = '(?:on|in|via|using|through|over)';

function unquote(value: string): string {
  return value.replace(/^["']+|["']+$/g, '').trim();
}

function cleanContact(value: string): string {
  return unquote(value).replace(/^(?:my|meu|minha|o|a)\s+/iu, '').trim();
}

function withApp(g: Groups, args: Record<string, string>): Record<string, string> {
  return g.app ? { ...args, app: g.app.trim() } : args;
}

function sendArgs(g: Groups): Record<string, string> | null {
  const contact = cleanContact(g.contact ?? '');
  const text = unquote(g.text ?? '');
  // "send a message to Ana" names no text; a later rule asks what to write.
  if (!contact || !text || /^(?:a |an |uma )?(?:message|text|msg|mensagem)$/iu.test(text)) {
    return null;
  }
  return withApp(g, { contact, text });
}

const DIRECTIONS: Record<string, string> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  cima: 'up',
  baixo: 'down',
  esquerda: 'left',
  direita: 'right',
  desce: 'down',
  descer: 'down',
  desça: 'down',
  sobe: 'up',
  subir: 'up',
  suba: 'up',
};

function fixed(args: Record<string, string>): (g: Groups) => Record<string, string> {
  return () => args;
}

const RULES: Rule[] = [
  {
    id: 'send-on-app-saying',
    tool: 'send_message',
    source: `^${EN_SEND_VERB}(?: a)?(?: message)?(?: to)? (?<contact>.+?) ${EN_ON} (?<app>APPS)(?: saying that| saying| that says| that|:|,)\\s*(?<text>.+)$`,
    build: sendArgs,
  },
  {
    id: 'send-saying',
    tool: 'send_message',
    source: `^${EN_SEND_VERB}(?: a)?(?: message)?(?: to)? (?<contact>.+?)(?: saying that| saying| that says| that|:|,)\\s*(?<text>.+?)(?: ${EN_ON} (?<app>APPS))?$`,
    build: sendArgs,
  },
  {
    id: 'send-text-to',
    tool: 'send_message',
    source: `^send (?<text>.+?) to (?<contact>.+?)(?: ${EN_ON} (?<app>APPS))?$`,
    build: sendArgs,
  },
  {
    id: 'send-no-text',
    tool: 'clarify',
    source: `^(?:send|write)(?: a| an)? (?:message|text|msg)(?: to)? (?<contact>.+?)(?: ${EN_ON} (?<app>APPS))?$`,
    build: (g) => ({ question: `What should the message to ${cleanContact(g.contact ?? '')} say?` }),
  },
  {
    id: 'pt-send-on-app-saying',
    tool: 'send_message',
    source: `^${PT_SEND_VERB}(?: uma)?(?: mensagem)?(?: ${PT_TO})? (?<contact>.+?) ${PT_ON} (?<app>APPS)(?: dizendo que| dizendo| falando que| falando| com o texto| que|:|,)\\s*(?<text>.+)$`,
    build: sendArgs,
  },
  {
    id: 'pt-send-saying',
    tool: 'send_message',
    source: `^${PT_SEND_VERB}(?: uma)?(?: mensagem)?(?: ${PT_TO})? (?<contact>.+?)(?: dizendo que| dizendo| falando que| falando| com o texto| que|:|,)\\s*(?<text>.+?)(?: ${PT_ON} (?<app>APPS))?$`,
    build: sendArgs,
  },
  {
    id: 'pt-tell',
    tool: 'send_message',
    source: `^(?:diz|diga|fala|fale|avisa|avise)(?: ${PT_TO})? (?<contact>.+?) que (?<text>.+?)(?: ${PT_ON} (?<app>APPS))?$`,
    build: sendArgs,
  },
  {
    id: 'pt-send-no-text',
    tool: 'clarify',
    source: `^(?:mand[ae]r?|envi[ae]r?)(?: uma)? mensagem(?: ${PT_TO})? (?<contact>.+?)(?: ${PT_ON} (?<app>APPS))?$`,
    build: (g) => ({ question: `O que a mensagem para ${cleanContact(g.contact ?? '')} deve dizer?` }),
  },
  {
    id: 'post',
    tool: 'create_post',
    source: '^(?:post|publish|share)(?: a)?(?: photo| picture| video| post)? (?:on|to) (?<app>APPS)(?: saying| with the caption| with caption| captioned|:|,)\\s*(?<caption>.+)$',
    build: (g) => ({ app: (g.app ?? '').trim(), caption: unquote(g.caption ?? '') }),
  },
  {
    id: 'post-caption-first',
    tool: 'create_post',
    source: '^(?:post|publish) (?<caption>.+?) (?:on|to) (?<app>APPS)$',
    build: (g) => ({ app: (g.app ?? '').trim(), caption: unquote(g.caption ?? '') }),
  },
  {
    id: 'pt-post',
    tool: 'create_post',
    source: '^(?:post[ae]r?|publi(?:ca|car|que))(?: uma)?(?: foto| vídeo| video)? no (?<app>APPS)(?: com a legenda| dizendo| escrito|:|,)\\s*(?<caption>.+)$',
    build: (g) => ({ app: (g.app ?? '').trim(), caption: unquote(g.caption ?? '') }),
  },
  {
    id: 'pt-post-caption-first',
    tool: 'create_post',
    source: '^(?:post[ae]r?|publi(?:ca|car|que)) (?<caption>.+?) no (?<app>APPS)$',
    build: (g) => ({ app: (g.app ?? '').trim(), caption: unquote(g.caption ?? '') }),
  },
  {
    id: 'play-on-app',
    tool: 'search',
    source: '^(?:play|watch|put on) (?<query>.+?) on (?<app>APPS)$',
    build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
  },
  {
    id: 'pt-play-on-app',
    tool: 'search',
    source: '^(?:toc[ae]r?|toca|coloc[ae]r?|coloca|coloque|bot[ae]r?|bota|assistir|ver) (?<query>.+?) no (?<app>APPS)$',
    build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
  },
  {
    id: 'search',
    tool: 'search',
    source: '^(?:search|look up|find|google)(?: for)? (?<query>.+?)(?: (?:on|in) (?<app>APPS))?$',
    build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
  },
  {
    id: 'pt-search',
    tool: 'search',
    source: '^(?:pesquis[ae]r?|pesquisa|procur[ae]r?|procura|busc[ae]r?|busca|busque)(?: por)? (?<query>.+?)(?: (?:no|na) (?<app>APPS))?$',
    build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
  },
  { id: 'back', tool: 'navigate', source: '^(?:go )?back$|^volt[ae]r?$|^volta$', build: fixed({ action: 'back' }) },
  {
    id: 'home',
    tool: 'navigate',
    source: '^(?:go )?home$|^(?:go to )?(?:the )?home screen$|^(?:(?:ir|vai) (?:para|pra) a )?tela inicial$|^in[ií]cio$',
    build: fixed({ action: 'home' }),
  },
  {
    id: 'recents',
    tool: 'navigate',
    source: '^(?:show |open )?(?:the )?recent(?:s| apps)$|^(?:apps |aplicativos )?recentes$',
    build: fixed({ action: 'recents' }),
  },
  {
    id: 'notifications',
    tool: 'navigate',
    source: '^(?:show |open )?(?:my |the )?notifications$|^(?:abr(?:a|e|ir) |mostr[ae]r? |mostra )?(?:as )?notifica(?:ções|coes)$',
    build: fixed({ action: 'notifications' }),
  },
  {
    id: 'quick-settings',
    tool: 'navigate',
    source: '^(?:open )?quick settings$|^(?:abr(?:a|e|ir) )?(?:as )?configura(?:ções|coes) r[aá]pidas$',
    build: fixed({ action: 'quick_settings' }),
  },
  {
    id: 'lock',
    tool: 'navigate',
    source: '^lock(?: the)?(?: screen| phone)?$|^bloque(?:ar|ie|ia)(?: a tela| o celular)?$',
    build: fixed({ action: 'lock_screen' }),
  },
  {
    id: 'screenshot',
    tool: 'navigate',
    source: '^(?:take )?(?:a )?screenshot$|^(?:tir[ae]r?|tira|faz(?:er)?|fa[çc]a) (?:um |uma )?(?:print|captura de tela)$',
    build: fixed({ action: 'screenshot' }),
  },
  {
    id: 'open',
    tool: 'open_app',
    source: '^(?:open|launch|start|go to|switch to)(?: the)? (?<app>.+?)(?: app)?$',
    build: (g) => ({ app: (g.app ?? '').trim() }),
  },
  {
    id: 'pt-open',
    tool: 'open_app',
    source: '^(?:abr(?:a|e|ir)|inici[ae]r?|entr[ae]r? (?:no|na)|vai (?:no|na|para o|para a|pro|pra)|ir (?:para o|para a|pro|pra))(?: o| a)? (?<app>.+?)$',
    build: (g) => ({ app: (g.app ?? '').trim() }),
  },
  {
    id: 'scroll',
    tool: 'scroll',
    source: '^(?:scroll|swipe)(?: (?<direction>up|down|left|right))?$',
    build: (g) => ({ direction: DIRECTIONS[(g.direction ?? 'down').toLowerCase()] ?? 'down' }),
  },
  {
    id: 'pt-scroll',
    tool: 'scroll',
    source: '^(?:rol(?:a|ar|e)|desliz(?:a|ar|e))(?: (?:para|pra))?(?: (?:a |o )?(?<direction>cima|baixo|esquerda|direita))?$|^(?<short>desce|descer|desça|sobe|subir|suba)$',
    build: (g) => ({ direction: DIRECTIONS[(g.direction ?? g.short ?? 'baixo').toLowerCase()] ?? 'down' }),
  },
  {
    id: 'pause',
    tool: 'media',
    source: '^(?:pause|stop)(?: the)?(?: video| music| song| track| playback)?$|^(?:paus[ae]r?|pausa|parar?)(?: o v[ií]deo| a m[uú]sica)?$',
    build: fixed({ action: 'play_pause' }),
  },
  {
    id: 'play',
    tool: 'media',
    source: '^(?:play|resume|continue|unpause)(?: the)?(?: video| music| song| track)?$|^(?:continu[ae]r?|continua|retom[ae]r?|retoma|despaus[ae]r?)$',
    build: fixed({ action: 'play_pause' }),
  },
  {
    id: 'next',
    tool: 'media',
    source: '^(?:next|skip)(?: video| song| track| one)?$|^(?:pr[oó]xim[ao]|pul[ae]r?|pula)(?: m[uú]sica| v[ií]deo| faixa)?$',
    build: fixed({ action: 'next' }),
  },
  {
    id: 'previous',
    tool: 'media',
    source: '^previous(?: video| song| track| one)?$|^(?:(?:m[uú]sica|v[ií]deo|faixa) )?anterior$',
    build: fixed({ action: 'previous' }),
  },
  {
    id: 'tap',
    tool: 'tap',
    source: '^(?:tap|click|press|touch|select|hit)(?: on)?(?: the)? (?<label>.+?)(?: button)?$',
    build: (g) => ({ label: unquote(g.label ?? '') }),
  },
  {
    id: 'pt-tap',
    tool: 'tap',
    source: '^(?:toqu?e|toca|tocar|clic(?:a|ar|que)|aperte|aperta|apertar|pressione|selecione|seleciona)(?: (?:em|no|na))?(?: o| a)? (?<label>.+?)(?: bot[aã]o)?$',
    build: (g) => ({ label: unquote(g.label ?? '') }),
  },
  {
    id: 'type',
    tool: 'type_text',
    source: '^(?:type|write|enter)(?: in)? (?<text>.+)$',
    build: (g) => ({ text: unquote(g.text ?? '') }),
  },
  {
    id: 'pt-type',
    tool: 'type_text',
    source: '^(?:digit[ae]r?|digita|escrev[ae]r?|escreve)(?: a[ií])? (?<text>.+)$',
    build: (g) => ({ text: unquote(g.text ?? '') }),
  },
];

const PREFIXES = [
  /^(?:(?:hey|hi|ok|okay|oi|olá|ola|e a[ií])\s+)?sigil[\s,:!.]*/iu,
  /^(?:please|por favor|can you|could you|would you|will you|você pode|voce pode|pode|poderia)\s+/iu,
];

/** Normalizes quotes and spacing and drops wake words, polite prefixes and final punctuation. */
export function cleanRequest(text: string): string {
  let s = text
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  for (let pass = 0; pass < 3; pass++) {
    const before = s;
    for (const prefix of PREFIXES) {
      s = s.replace(prefix, '');
    }
    if (s === before) {
      break;
    }
  }
  return s
    .replace(/[.!?]+$/u, '')
    .replace(/[\s,]+(?:please|por favor)$/iu, '')
    .replace(/[.!?]+$/u, '')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const compiledCache = new Map<string, RegExp[]>();

function compile(appNames: readonly string[]): RegExp[] {
  const names = [...new Set(appNames.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const alternation = names.length > 0 ? names.map(escapeRegExp).join('|') : '(?!)';
  let compiled = compiledCache.get(alternation);
  if (!compiled) {
    compiled = RULES.map((rule) => new RegExp(rule.source.split('APPS').join(`(?:${alternation})`), 'iu'));
    compiledCache.set(alternation, compiled);
  }
  return compiled;
}

/**
 * Matches a request against the rules. appNames lists the app names and
 * aliases that may follow "on" or "no" in a request.
 */
export function parseRequest(text: string, appNames: readonly string[]): RuleMatch | null {
  const cleaned = cleanRequest(text);
  if (!cleaned) {
    return null;
  }
  const patterns = compile(appNames);
  for (let i = 0; i < RULES.length; i++) {
    const match = patterns[i].exec(cleaned);
    if (!match) {
      continue;
    }
    const args = RULES[i].build((match.groups ?? {}) as Groups);
    if (args && Object.values(args).every((v) => v.length > 0)) {
      return { tool: RULES[i].tool, args, rule: RULES[i].id };
    }
  }
  return null;
}
