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
    units: ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun'],
    teens: ['zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'],
    tens: ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'],
    compose: (ten, unit, u) => [`${u === 1 ? 'ein' : unit}und${ten}`],
    extra: [
      ['ein', 1],
      ['eine', 1],
      ['einer', 1],
      ['hundert', 100],
      ['einhundert', 100],
      ['halbe', 0.5],
    ],
  }),
);

const SEND = '(?:schick|schicke|schicken|sende|senden|schreib|schreibe|schreiben)';
const VIA = '(?:auf|über|per|mit|via|bei|in)';
const BARE_MESSAGE = /^(?:eine )?(?:nachricht|sms)$/iu;
const cleanContact = contactCleaner(/^(?:an\s+)?(?:meine[mnr]?|mein|den|die|der|dem)\s+/iu);
const sendArgs = (g: Groups) => messageArgs(g, cleanContact, BARE_MESSAGE);

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^(?:oben|hoch|rauf)$/iu, 'up'],
  [/^(?:unten|runter)$/iu, 'down'],
  [/^links$/iu, 'left'],
  [/^rechts$/iu, 'right'],
];

const STREAMS: [RegExp, 'ring' | 'alarm'][] = [
  [/^(?:klingelton|klingel|anruf|lautlos)/iu, 'ring'],
  [/^(?:wecker|alarm)/iu, 'alarm'],
];

function stream(g: Groups): { stream?: 'ring' | 'alarm' } {
  if (!g.stream) return {};
  const value = lookup<'media' | 'ring' | 'alarm'>(g.stream, STREAMS, 'media');
  return value === 'media' ? {} : { stream: value };
}

function levelArgs(tool: 'volume' | 'brightness', g: Groups): RuleArgs | null {
  const level = g.extreme ? (/^max/iu.test(g.extreme) ? 100 : 0) : percent(numbers.parse(g.level));
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
    return { rate: /^normal/iu.test(g.named) ? 1 : /^doppel/iu.test(g.named) ? 2 : 0.5 };
  }
  const value = speedRate(numbers.parse(g.rate));
  return value === null ? null : { rate: value };
}

const RAISE = /^(?:hoch|rauf|höher|erhöhen|erhöhe|erhöh|lauter|heller|aufdrehen)$/iu;

export const de: LanguagePack = {
  id: 'de',
  code: 'de',
  vocab: {
    NUM: numbers.pattern(),
    PCT: '(?:\\s*%| prozent)',
    UNIT: '(?<unit>sekunden?|minuten?)',
    STREAM: '(?<stream>klingelton|wecker|alarm|medien)?',
  },
  rules: [
    {
      id: 'send-on-app-saying',
      tool: 'send_message',
      source: [
        `^${SEND}(?: eine)?(?: nachricht)?(?: an)? (?<contact>.+?) ${VIA} (?<app>APPS)(?:,? dass|:|,)\\s*(?<text>.+)$`,
        `^${SEND} (?<contact>.+?) eine nachricht ${VIA} (?<app>APPS)(?:,? dass|:|,)\\s*(?<text>.+)$`,
        `^${SEND} (?<contact>.+?) ${VIA} (?<app>APPS) eine nachricht(?:,? dass|:|,)\\s*(?<text>.+)$`,
      ],
      build: sendArgs,
    },
    {
      id: 'send-saying',
      tool: 'send_message',
      source: [
        `^${SEND} (?<contact>.+?) eine nachricht(?:,? dass|:|,)\\s*(?<text>.+?)(?: ${VIA} (?<app>APPS))?$`,
        `^${SEND}(?: eine)?(?: nachricht)?(?: an)? (?<contact>.+?)(?:,? dass|:|,)\\s*(?<text>.+?)(?: ${VIA} (?<app>APPS))?$`,
      ],
      build: sendArgs,
    },
    {
      id: 'tell',
      tool: 'send_message',
      source: `^(?:sag|sage|sagen|richte|teile)(?: mal)? (?<contact>.+?),? dass (?<text>.+?)(?: ${VIA} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: [
        `^${SEND}(?: eine)? nachricht(?: an)? (?<contact>.+?)(?: ${VIA} (?<app>APPS))?$`,
        `^${SEND} (?<contact>.+?) eine nachricht(?: ${VIA} (?<app>APPS))?$`,
      ],
      build: (g) => ({ question: de.askMessageText(cleanContact(unquote(g.contact ?? ''))) }),
    },
    {
      id: 'play-on-app',
      tool: 'search',
      source: '^(?:spiel|spiele|zeig|zeige|starte) (?<query>.+?) (?:auf|bei|in) (?<app>APPS)(?: ab)?$',
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: [
        '^(?:such|suche|suchen|finde|google)(?: nach)? (?<query>.+?)(?: (?:auf|bei|in) (?<app>APPS))?$',
        '^(?:auf|bei|in) (?<app>APPS) nach (?<query>.+?) suchen$',
      ],
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source: [
        '^(?:(?:stell|stelle|setz|setze|mach|mache|dreh|drehe) )?(?:die )?STREAMlautstärke (?:auf )?(?:(?<level>NUM)PCT?|(?<extreme>maximum|max|minimum))(?: (?:stellen|setzen|einstellen))?$',
        '^(?<extreme>maximale|minimale) STREAMlautstärke$',
      ],
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        '^(?:(?:mach|mache|dreh|drehe) )?(?:es |den ton |die musik |das video )?(?<dir>lauter|leiser)$',
        '^(?:die )?STREAMlautstärke (?<dir>hoch|rauf|höher|runter|niedriger|erhöhen|verringern|senken|reduzieren|aufdrehen|leiser|lauter)$',
        '^(?<dir>erhöhe|erhöh|verringere|verringer|senke|senk|reduziere) (?:die )?STREAMlautstärke$',
        '^(?:dreh|drehe|mach|mache) (?:die )?STREAMlautstärke (?<dir>hoch|rauf|runter)$',
      ],
      build: (g) => ({ action: RAISE.test(g.dir ?? '') ? 'up' : 'down', ...stream(g) }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: [
        '^(?:(?:schalte|schalt|mach|mache) (?:den ton |das handy |das telefon |es )?)?(?:stumm(?:schalten)?|(?<stream>lautlos))$',
        '^(?:mach |mache )?(?:den )?ton aus$',
        '^(?:ton|sound) aus(?:schalten)?$',
      ],
      build: (g) => ({ action: 'mute', ...stream(g) }),
    },
    {
      id: 'unmute',
      tool: 'volume',
      source: '^(?:(?:mach|mache) )?(?:den )?ton (?:wieder )?an$|^stummschaltung (?:aufheben|beenden|aus)$|^(?:ton|sound) (?:wieder )?ein(?:schalten)?$',
      build: fixed({ action: 'unmute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source: '^(?:(?:stell|stelle|setz|setze|mach|mache) )?(?:die )?(?:bildschirm)?helligkeit (?:auf )?(?:(?<level>NUM)PCT?|(?<extreme>maximum|max|minimum))(?: (?:stellen|setzen|einstellen))?$',
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        '^(?:(?:mach|mache|stell|stelle) )?(?:den bildschirm |es |das display )?(?<dir>heller|dunkler)$',
        '^(?:die )?(?:bildschirm)?helligkeit (?<dir>hoch|rauf|höher|runter|niedriger|erhöhen|verringern|senken|reduzieren)$',
        '^(?<dir>erhöhe|erhöh|verringere|verringer|senke|senk|reduziere) (?:die )?(?:bildschirm)?helligkeit$',
        '^(?:bildschirm|display) (?:heller|dunkler) machen$',
      ],
      build: (g) => ({ action: RAISE.test(g.dir ?? '') ? 'up' : 'down' }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source: [
        '^(?:(?:spul|spule|spring|springe|geh|gehe) )?(?:um )?(?<n>NUM) UNIT (?:vor|vorwärts|weiter|nach vorne)$',
        '^(?<n>NUM) UNIT (?:vorspulen|überspringen)$',
        '^(?:spul|spule|spring|springe) (?:vor|vorwärts) (?:um )?(?<n>NUM) UNIT$',
      ],
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: [
        '^(?:(?:spul|spule|spring|springe|geh|gehe) )?(?:um )?(?<n>NUM) UNIT (?:zurück|rückwärts)$',
        '^(?<n>NUM) UNIT zurückspulen$',
        '^(?:spul|spule|spring|springe|geh|gehe) (?:zurück|rückwärts) (?:um )?(?<n>NUM) UNIT$',
      ],
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        '^(?:(?:stell|stelle|setz|setze) )?(?:die )?(?:wiedergabe)?geschwindigkeit (?:auf )?(?<rate>NUM) ?(?:x|fach)?(?: (?:stellen|setzen))?$',
        '^(?:in |mit |auf )?(?<rate>NUM)[ -]?(?:fache[rn]?|x) (?:wiedergabe)?geschwindigkeit$',
        '^(?<rate>NUM) ?x$',
      ],
      build: rate,
    },
    {
      id: 'speed-named',
      tool: 'playback_speed',
      source: '^(?:(?:in|mit|auf) )?(?<named>normale[rn]?|doppelte[rn]?|halbe[rn]?) (?:wiedergabe)?geschwindigkeit$',
      build: rate,
    },
    {
      id: 'like',
      tool: 'like',
      source: [
        '^(?:like|liken|like das|like dieses|like den|like die)(?: video| foto| bild| post| beitrag| reel)?(?: (?:auf|bei|in) (?<app>APPS))?$',
        '^(?:das )?gefällt mir$',
        '^(?:gib|gebe)(?: dem video| dem post| dem foto| dem beitrag)? (?:ein |einen )?like$',
        '^daumen hoch$',
      ],
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?:(?<verb>öffne|zeig|zeige|schließ|schließe|versteck|verstecke) )?(?:die )?(?:steuerungs|kontroll)?sphäre(?: (?<verb2>öffnen|zeigen|schließen|ausblenden))?$',
      build: (g) => ({ action: /^(?:schließ|versteck|ausblend)/iu.test(g.verb ?? g.verb2 ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:(?:schalte|schalt|mach|mache|öffne|aktiviere|deaktiviere) )?(?:das |die )?(?:wlan|wi-?fi)(?:[ -]?einstellungen)?(?: (?:an|aus|ein|einschalten|ausschalten|öffnen|aktivieren|deaktivieren))?$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:(?:schalte|schalt|mach|mache|öffne|aktiviere|deaktiviere) )?(?:das |die )?bluetooth(?:[ -]?einstellungen)?(?: (?:an|aus|ein|einschalten|ausschalten|öffnen|aktivieren|deaktivieren))?$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source: '^(?:(?:aktiviere|deaktiviere|schalte|öffne) )?(?:bitte )?nicht stören(?:[ -]?modus)?(?: (?:an|aus|ein|einschalten|ausschalten|aktivieren|deaktivieren))?$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    { id: 'back', tool: 'navigate', source: '^(?:geh |gehe )?zurück$', build: fixed({ action: 'back' }) },
    {
      id: 'home',
      tool: 'navigate',
      source: '^(?:(?:geh|gehe) )?(?:zum )?(?:startbildschirm|home(?:bildschirm)?)$|^startbildschirm (?:öffnen|zeigen)$',
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:(?:zeig|zeige|öffne) )?(?:die )?(?:letzten|zuletzt verwendeten) apps(?: (?:öffnen|zeigen))?$|^app-übersicht$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^(?:(?:zeig|zeige|öffne)(?: mir)? )?(?:die |meine )?benachrichtigungen(?: (?:öffnen|anzeigen|zeigen))?$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^(?:(?:zeig|zeige|öffne) )?(?:die )?schnelleinstellungen(?: öffnen)?$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: '^(?:sperr|sperre) (?:den bildschirm|das handy|das telefon)$|^(?:bildschirm|handy|telefon) sperren$|^sperren$',
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: '^(?:(?:mach|mache) (?:einen |ein )?)?(?:screenshot|bildschirmfoto)(?: machen)?$',
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: '^(?:(?:öffne|zeig|zeige) )?(?:das )?(?:ein[ -]?/?[ -]?aus[ -]?menü|power[ -]?menü|ausschaltmenü)(?: öffnen)?$',
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:pause|pausieren|pausiere|anhalten|halt an|stopp|stop)(?: das video| die musik| die wiedergabe)?$|^(?:video|musik|wiedergabe) (?:pausieren|anhalten)$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:weiter|weiterspielen|abspielen|wiedergabe|play|fortsetzen|spiel weiter|mach weiter)$|^(?:video|musik|wiedergabe) (?:fortsetzen|abspielen)$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:nächste[rs]?|überspringen)(?: lied| titel| song| video| track)?$|^(?:spiel )?(?:das |den )?nächste[rns]? (?:lied|titel|song|video|track)$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:vorherige[rs]?|vorige[rs]?)(?: lied| titel| song| video| track)?$|^(?:zurück zum|spiel das) (?:vorherigen|letzten) (?:lied|titel|song|video)$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: [
        '^(?:öffne|öffnen|starte|starten|geh zu|gehe zu|wechsle zu)(?: die| den| das)?(?: app)? (?<app>.+?)$',
        '^(?:mach|mache) (?:die |den |das )?(?<app>.+?) auf$',
        '^(?:die |den |das )?(?<app>.+?) (?:öffnen|starten|aufmachen)$',
      ],
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: [
        '^(?:scroll|scrolle|scrollen|wisch|wische|blättere|blätter)(?: nach)? (?<direction>unten|oben|links|rechts|runter|hoch|rauf)$',
        '^(?:nach )?(?<direction>unten|oben|links|rechts|runter|hoch|rauf) (?:scrollen|wischen|blättern)$',
        '^(?<direction>runter|hoch)$',
        '^(?:scroll|scrolle|scrollen)$',
      ],
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
  ],
  prefixes: [
    /^(?:(?:hey|hallo|ok|okay)\s+)?sigil[\s,:!.]*/iu,
    /^(?:bitte|kannst du|könntest du|kannst du bitte)\s+/iu,
  ],
  suffixes: [/[\s,]+bitte$/iu],
  yes: ['ja', 'jawohl', 'klar', 'okay', 'ok', 'genau', 'bestätigen', 'bestätige', 'senden', 'schick es', 'abschicken', 'mach das', 'los', 'passt', 'ja bitte'],
  no: ['nein', 'nee', 'abbrechen', 'abbruch', 'stopp', 'warte', 'nicht jetzt', 'lass es', 'auf keinen fall'],
  sensitive: [
    'senden',
    'absenden',
    'schicken',
    'posten',
    'veröffentlichen',
    'teilen',
    'anrufen',
    'löschen',
    'entfernen',
    'bezahlen',
    'zahlen',
    'kaufen',
    'bestellen',
    'abonnieren',
    'überweisen',
    'bestätigen',
    'deinstallieren',
  ],
  bulk: [
    /(?:^|\s)(?:an\s+)?(?:alle|allen)\s+(?:meine[n]?\s+|die\s+|den\s+)?(?:kontakte[n]?|freunde[n]?|follower[n]?|gruppen|chats|leute[n]?|personen|beiträge[n]?|posts|fotos|bilder[n]?|videos|kommentare[n]?|nachrichten)(?:\s|$)/iu,
    /(?:^|\s)(?:an alle|allen|jedem|jeder person)(?:\s|$)/iu,
    /(?:^|\s)\d+\s*mal(?:\s|$)/iu,
    /(?:^|\s)(?:jede|jeden|alle)\s+(?:\d+\s+)?(?:sekunde|minute|stunde|tag|morgen|abend)n?(?:\s|$)/iu,
    /(?:^|\s)(?:massenhaft|massenweise)(?:\s|$)/iu,
  ],
  severalPeople: [/,|\s(?:und|&|\+)\s/iu],
  askMessageText: (contact) => `Was soll in der Nachricht an ${contact} stehen?`,
};
