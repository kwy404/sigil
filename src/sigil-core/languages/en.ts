import {
  composeNumbers,
  contactCleaner,
  fixed,
  lookup,
  messageArgs,
  NumberWords,
  percent,
  speedRate,
  toSeconds,
  unquote,
  withApp,
} from './helpers';
import type { Groups, LanguagePack, RuleArgs } from './types';

const numbers = new NumberWords(
  composeNumbers({
    units: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'],
    teens: ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'],
    tens: ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'],
    compose: (ten, unit) => [`${ten} ${unit}`],
    extra: [
      ['a hundred', 100],
      ['one hundred', 100],
      ['hundred', 100],
      ['a', 1],
      ['an', 1],
    ],
  }),
);

const SEND = '(?:send|text|message|tell|write)';
const ON = '(?:on|in|via|using|through|over)';
const BARE_MESSAGE = /^(?:a |an )?(?:message|text|msg)$/iu;
const cleanContact = contactCleaner(/^(?:my|the)\s+/iu);
const sendArgs = (g: Groups) => messageArgs(g, cleanContact, BARE_MESSAGE);

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^up$/iu, 'up'],
  [/^down$/iu, 'down'],
  [/^left$/iu, 'left'],
  [/^right$/iu, 'right'],
];

const STREAMS: [RegExp, 'media' | 'ring' | 'alarm'][] = [
  [/^(?:ring|ringer|ringtone)$/iu, 'ring'],
  [/^alarms?$/iu, 'alarm'],
];

function stream(g: Groups): { stream?: 'ring' | 'alarm' } {
  const value = lookup(g.stream, STREAMS, 'media');
  return value === 'media' ? {} : { stream: value };
}

function levelArgs(tool: 'volume' | 'brightness', g: Groups): RuleArgs | null {
  const level = g.extreme ? (/^(?:max|maximum|full)$/iu.test(g.extreme) ? 100 : 0) : percent(numbers.parse(g.level));
  if (level === null) return null;
  return { action: 'set', level, ...(tool === 'volume' ? stream(g) : {}) };
}

function seek(direction: 'forward' | 'back') {
  return (g: Groups): RuleArgs | null => {
    const seconds = toSeconds(numbers.parse(g.n), g.unit, /^min/iu);
    return seconds === null ? null : { direction, seconds };
  };
}

function rate(g: Groups): RuleArgs | null {
  if (g.named) {
    return { rate: /^half$/iu.test(g.named) ? 0.5 : /^double$/iu.test(g.named) ? 2 : 1 };
  }
  const value = speedRate(numbers.parse(g.rate));
  return value === null ? null : { rate: value };
}

export const en: LanguagePack = {
  id: 'en',
  code: 'en',
  vocab: {
    NUM: numbers.pattern(),
    PCT: '(?:\\s*%| percent| per cent)',
    UNIT: '(?<unit>seconds?|secs?|minutes?|mins?)',
    STREAM: '(?<stream>ring|ringer|ringtone|alarms?|media|music)',
  },
  rules: [
    {
      id: 'send-on-app-saying',
      tool: 'send_message',
      source: `^${SEND}(?: a)?(?: message)?(?: to)? (?<contact>.+?) ${ON} (?<app>APPS)(?: saying that| saying| that says| that|:|,)\\s*(?<text>.+)$`,
      build: sendArgs,
    },
    {
      id: 'send-saying',
      tool: 'send_message',
      source: `^${SEND}(?: a)?(?: message)?(?: to)? (?<contact>.+?)(?: saying that| saying| that says| that|:|,)\\s*(?<text>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'send-text-to',
      tool: 'send_message',
      source: `^send (?<text>.+?) to (?<contact>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: `^(?:send|write)(?: a| an)? (?:message|text|msg)(?: to)? (?<contact>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: (g) => ({ question: en.askMessageText(cleanContact(unquote(g.contact ?? ''))) }),
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
      id: 'play-on-app',
      tool: 'search',
      source: '^(?:play|watch|put on) (?<query>.+?) (?:on|in) (?<app>APPS)$',
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: '^(?:search|look up|find|google)(?: for)? (?<query>.+?)(?: (?:on|in) (?<app>APPS))?$',
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source:
        '^(?:(?:set|change|put|turn) )?(?:the )?(?:STREAM )?volume(?: level)? (?:to |at )?(?:(?<level>NUM)PCT?|(?:the )?(?<extreme>max|maximum|full|min|minimum))$',
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-extreme',
      tool: 'volume',
      source: '^(?<extreme>max|maximum|full|min|minimum) (?:STREAM )?volume$',
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        '^(?:turn|crank) (?:the )?(?:STREAM )?volume (?<dir>up|down)$',
        '^(?:turn|crank) (?<dir>up|down) (?:the )?(?:STREAM )?volume$',
        '^(?:the )?(?:STREAM )?volume (?<dir>up|down)$',
        '^turn it (?<dir>up|down)$',
      ],
      build: (g) => ({ action: (g.dir ?? 'up').toLowerCase(), ...stream(g) }),
    },
    {
      id: 'volume-verb',
      tool: 'volume',
      source: '^(?<verb>increase|raise|boost|lower|decrease|reduce) (?:the )?(?:STREAM )?volume$',
      build: (g) => ({ action: /^(?:increase|raise|boost)$/iu.test(g.verb ?? '') ? 'up' : 'down', ...stream(g) }),
    },
    {
      id: 'volume-louder',
      tool: 'volume',
      source: '^(?:make it )?(?<word>louder|quieter|softer)$',
      build: (g) => ({ action: /^louder$/iu.test(g.word ?? '') ? 'up' : 'down' }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: '^(?<verb>mute|unmute)(?: the)?(?: (?:STREAM|sound|audio|video))?(?: volume)?$',
      build: (g) => ({ action: (g.verb ?? 'mute').toLowerCase(), ...stream(g) }),
    },
    {
      id: 'silence-phone',
      tool: 'volume',
      source: '^(?:silence|mute) (?:my |the )?(?:phone|ringer)$',
      build: fixed({ action: 'mute', stream: 'ring' }),
    },
    {
      id: 'sound-on-off',
      tool: 'volume',
      source: '^turn (?:the )?sound (?:back )?(?<state>on|off)$',
      build: (g) => ({ action: /^on$/iu.test(g.state ?? '') ? 'unmute' : 'mute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source:
        '^(?:(?:set|change|put|turn) )?(?:the )?(?:screen )?brightness (?:to |at )?(?:(?<level>NUM)PCT?|(?:the )?(?<extreme>max|maximum|full|min|minimum))$',
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        '^(?:turn|crank) (?:the )?(?:screen )?brightness (?<dir>up|down)$',
        '^turn (?<dir>up|down) (?:the )?(?:screen )?brightness$',
        '^(?:the )?(?:screen )?brightness (?<dir>up|down)$',
      ],
      build: (g) => ({ action: (g.dir ?? 'up').toLowerCase() }),
    },
    {
      id: 'brightness-verb',
      tool: 'brightness',
      source: '^(?<verb>increase|raise|boost|lower|decrease|reduce|dim) (?:the )?(?:screen )?(?:brightness|screen)$',
      build: (g) => ({ action: /^(?:increase|raise|boost)$/iu.test(g.verb ?? '') ? 'up' : 'down' }),
    },
    {
      id: 'brightness-adjective',
      tool: 'brightness',
      source: '^(?:make (?:the )?screen )?(?<word>brighter|darker|dimmer)$',
      build: (g) => ({ action: /^brighter$/iu.test(g.word ?? '') ? 'up' : 'down' }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source:
        '^(?:skip|jump|go|fast forward|forward|move)(?: ahead| forward)?(?: by)? (?<n>NUM) UNIT(?: ahead| forward)?$',
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: [
        '^(?:(?:go|jump|skip|move|rewind) back|rewind|back)(?: by)? (?<n>NUM) UNIT$',
        '^(?:go|jump|skip|move) (?<n>NUM) UNIT back(?:wards)?$',
      ],
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        '^(?:(?:set|change|put) )?(?:the )?(?:playback )?speed (?:to |at )?(?<rate>NUM)(?:x| times)?$',
        '^(?:play|watch)(?: it)?(?: at)? (?<rate>NUM)(?:x| times)(?: speed)?$',
        '^(?<rate>NUM)x(?: speed)?$',
      ],
      build: rate,
    },
    {
      id: 'speed-named',
      tool: 'playback_speed',
      source: '^(?:(?:play|watch)(?: it)? at |(?:set )?(?:the )?(?:playback )?speed to )?(?<named>normal|regular|double|half) speed$',
      build: rate,
    },
    {
      id: 'like',
      tool: 'like',
      source: [
        '^(?:like|heart)(?: (?:it|this|that|the))?(?: (?:video|post|photo|picture|reel|short|song|one))?(?: (?:on|in) (?<app>APPS))?$',
        '^(?:give|leave)(?: it| this)? a like(?: (?:on|in) (?<app>APPS))?$',
      ],
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?:(?<verb>open|show|bring up|close|hide|dismiss) )?(?:the )?(?:control )?sphere$',
      build: (g) => ({ action: /^(?:close|hide|dismiss)$/iu.test(g.verb ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:(?:turn|switch) (?:on|off) (?:the )?|(?:open|show) (?:the )?)?(?:wi-?fi|wireless)(?: (?:on|off|settings|panel))?$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:(?:turn|switch) (?:on|off) (?:the )?|(?:open|show) (?:the )?)?bluetooth(?: (?:on|off|settings|panel))?$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source:
        '^(?:(?:turn|switch) (?:on|off) |(?:open|enable|disable|start) )?(?:the )?(?:do not disturb|dnd)(?: mode)?(?: (?:on|off|settings))?$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    { id: 'back', tool: 'navigate', source: '^(?:go )?back$', build: fixed({ action: 'back' }) },
    {
      id: 'home',
      tool: 'navigate',
      source: '^(?:go )?home$|^(?:go to )?(?:the )?home screen$',
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:show |open )?(?:the )?(?:my )?recent(?:s| apps)$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^(?:show |open )?(?:my |the )?notifications$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^(?:open |show )?(?:the )?quick settings$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: '^lock(?: the)?(?: screen| phone)?$',
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: '^(?:take )?(?:a )?screen ?shot$',
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: '^(?:open |show )?(?:the )?(?:power|power off|shutdown|shut down)(?: (?:menu|options|dialog))$',
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:pause|stop)(?: the)?(?: video| music| song| track| playback| it)?$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:play|resume|continue|unpause)(?: the)?(?: video| music| song| track| it)?$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'play-pause',
      tool: 'media',
      source: '^(?:play pause|play or pause|toggle (?:play|playback))$',
      build: fixed({ action: 'play_pause' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:next|skip)(?: video| song| track| one)?$|^(?:play the )?next (?:video|song|track)$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:previous|last)(?: video| song| track| one)$|^previous$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: '^(?:open|launch|start|go to|switch to)(?: the)? (?<app>.+?)(?: app)?$',
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: '^(?:scroll|swipe)(?: (?<direction>up|down|left|right))?$',
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
    {
      id: 'tap',
      tool: 'tap',
      source: '^(?:tap|click|press|touch|select|hit)(?: on)?(?: the)? (?<label>.+?)(?: button)?$',
      build: (g) => ({ label: unquote(g.label ?? '') }),
    },
    {
      id: 'type',
      tool: 'type_text',
      source: '^(?:type|write|enter)(?: in)? (?<text>.+)$',
      build: (g) => ({ text: unquote(g.text ?? '') }),
    },
  ],
  prefixes: [
    /^(?:(?:hey|hi|ok|okay)\s+)?sigil[\s,:!.]*/iu,
    /^(?:please|can you|could you|would you|will you)\s+/iu,
  ],
  suffixes: [/[\s,]+please$/iu],
  yes: ['yes', 'yeah', 'yep', 'yes please', 'sure', 'ok', 'okay', 'confirm', 'do it', 'send it', 'post it', 'share it', 'go ahead'],
  no: ['no', 'nope', 'cancel', 'stop', "don't", 'do not', 'wait', 'not now', 'never mind', 'nevermind'],
  sensitive: [
    'send',
    'post',
    'publish',
    'share',
    'call',
    'delete',
    'remove',
    'pay',
    'buy',
    'purchase',
    'order',
    'checkout',
    'subscribe',
    'transfer',
    'confirm',
    'uninstall',
  ],
  bulk: [
    /\b(?:all|every|each)\s+(?:of\s+)?(?:my\s+|the\s+)?(?:contacts|friends|followers|following|groups|chats|people|users|posts|photos|videos|comments|messages)\b/iu,
    /\b(?:everyone|everybody)\b/iu,
    // "2x" and "1.5 times" are playback speeds; repeats start at two times or five x.
    /\b(?:[2-9]|\d{2,})\s*times\b(?!\s+(?:the\s+)?speed)/iu,
    /(?:^|[^\d.,])(?:[5-9]|\d{2,})\s*x\b/iu,
    /\b(?:every|each)\s+(?:\d+\s+)?(?:second|minute|hour|day|morning|night)s?\b/iu,
    /\b(?:spam|bulk|mass\s+\w+|auto\s*like|auto\s*follow)\b/iu,
  ],
  severalPeople: [/,|\s(?:and|&|\+)\s/iu],
  askMessageText: (contact) => `What should the message to ${contact} say?`,
};
