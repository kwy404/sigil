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
    units: ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'],
    teens: ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'],
    tens: ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'],
    // The tens drop their last vowel before uno and otto, and tre takes an accent: ventuno, ventotto, ventitré.
    compose: (ten, unit, u) => [`${u === 1 || u === 8 ? ten.slice(0, -1) : ten}${u === 3 ? 'tré' : unit}`],
    extra: [
      ['un', 1],
      ['una', 1],
      ['cento', 100],
      ['mezzo', 0.5],
    ],
  }),
);

const SEND = '(?:manda|mandare|invia|inviare|scrivi|scrivere|spedisci)';
const TO = '(?:a|ad|per)';
const VIA = '(?:su|con|via|tramite|in)';
const BARE_MESSAGE = /^(?:un )?(?:messaggio|sms)$/iu;
const cleanContact = contactCleaner(/^(?:(?:mio|mia|il|la|lo)\s+|l')/iu);
const sendArgs = (g: Groups) => messageArgs(g, cleanContact, BARE_MESSAGE);

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^(?:alto|su|sali)$/iu, 'up'],
  [/^(?:basso|giù|giu|scendi)$/iu, 'down'],
  [/^sinistra$/iu, 'left'],
  [/^destra$/iu, 'right'],
];

const STREAMS: [RegExp, 'ring' | 'alarm'][] = [
  [/^(?:suoneria|chiamate|silenziosa)/iu, 'ring'],
  [/^(?:sveglia|allarme)/iu, 'alarm'],
];

function stream(g: Groups): { stream?: 'ring' | 'alarm' } {
  if (!g.stream) return {};
  const value = lookup<'media' | 'ring' | 'alarm'>(g.stream, STREAMS, 'media');
  return value === 'media' ? {} : { stream: value };
}

function levelArgs(tool: 'volume' | 'brightness', g: Groups): RuleArgs | null {
  const level = g.extreme ? (/^mass/iu.test(g.extreme) ? 100 : 0) : percent(numbers.parse(g.level));
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
    return { rate: /^normale$/iu.test(g.named) ? 1 : /^doppia$/iu.test(g.named) ? 2 : 0.5 };
  }
  const value = speedRate(numbers.parse(g.rate));
  return value === null ? null : { rate: value };
}

const UP = '(?:alza|alzare|aumenta|aumentare)';
const DOWN = '(?:abbassa|abbassare|diminuisci|diminuire|riduci|ridurre)';

export const it: LanguagePack = {
  id: 'it',
  code: 'it',
  vocab: {
    NUM: numbers.pattern(),
    PCT: '(?:\\s*%| per cento|percento)',
    UNIT: '(?<unit>secondi|secondo|minuti|minuto)',
    STREAM: '(?:della |delle |dell\')?(?<stream>suoneria|sveglia|allarme|chiamate)',
  },
  rules: [
    {
      id: 'send-on-app-saying',
      tool: 'send_message',
      source: `^${SEND}(?: un)?(?: messaggio)?(?: ${TO})? (?<contact>.+?) ${VIA} (?<app>APPS)(?: dicendo che| dicendo| con scritto| che dice| che|:|,)\\s*(?<text>.+)$`,
      build: sendArgs,
    },
    {
      id: 'send-saying',
      tool: 'send_message',
      source: `^${SEND}(?: un)?(?: messaggio)?(?: ${TO})? (?<contact>.+?)(?: dicendo che| dicendo| con scritto| che dice| che|:|,)\\s*(?<text>.+?)(?: ${VIA} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'tell',
      tool: 'send_message',
      source: `^(?:di'|dì|di|dici|dite|avvisa|avverti)(?: (?:a|ad))? (?<contact>.+?) che (?<text>.+?)(?: ${VIA} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: `^(?:manda|mandare|invia|inviare|scrivi|scrivere)(?: un)? messaggio(?: ${TO})? (?<contact>.+?)(?: ${VIA} (?<app>APPS))?$`,
      build: (g) => ({ question: it.askMessageText(cleanContact(unquote(g.contact ?? ''))) }),
    },
    {
      id: 'play-on-app',
      tool: 'search',
      source: '^(?:metti|mettere|riproduci|suona|guarda) (?<query>.+?) su (?<app>APPS)$',
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: '^(?:cerca|cercare|trova|trovami)(?: di)? (?<query>.+?)(?: su (?<app>APPS))?$',
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source: '^(?:(?:metti|imposta|porta|alza|abbassa) )?(?:il )?volume(?: STREAM)? (?:al |a |su |all\')?(?:(?<level>NUM)PCT?|(?<extreme>massimo|minimo))$',
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: il)? volume(?: STREAM)?$`,
        '^(?:volume )?(?<word>più alto|più basso|più forte|più piano)$',
        `^(?<verb>${UP}|${DOWN}) l'audio$`,
      ],
      build: (g) => ({
        action: new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^più (?:alto|forte)$/iu.test(g.word ?? '') ? 'up' : 'down',
        ...stream(g),
      }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: [
        "^(?:silenzia|silenziare|muto|metti (?:in )?muto|togli l'audio|disattiva l'audio|azzera l'audio)$",
        '^(?:(?:metti|attiva) )?(?:la )?modalità (?<stream>silenziosa)$',
        '^(?:silenzia|silenziare) (?:il )?(?<stream>telefono|suoneria)$',
      ],
      build: (g) => ({ action: 'mute', ...(g.stream ? { stream: 'ring' } : {}) }),
    },
    {
      id: 'unmute',
      tool: 'volume',
      source: "^(?:togli il muto|togli muto|riattiva l'audio|rimetti l'audio|attiva l'audio|riaccendi l'audio)$",
      build: fixed({ action: 'unmute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source: "^(?:(?:metti|imposta|porta|alza|abbassa) )?(?:la )?luminosità(?: dello schermo)? (?:al |a |su |all')?(?:(?<level>NUM)PCT?|(?<extreme>massimo|minimo))$",
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: la)? luminosità(?: dello schermo)?$`,
        '^(?:rendi )?(?:lo )?schermo (?<word>più luminoso|più chiaro|più scuro)$',
        '^(?<word>schiarisci|scurisci) lo schermo$',
      ],
      build: (g) => ({
        action:
          new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^(?:più luminoso|più chiaro|schiarisci)$/iu.test(g.word ?? '')
            ? 'up'
            : 'down',
      }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source: [
        "^(?:vai |va' |manda |porta )?avanti(?: di)? (?<n>NUM) UNIT$",
        '^(?:salta|saltare)(?: di)? (?<n>NUM) UNIT$',
      ],
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: [
        "^(?:(?:torna|vai|va'|manda|porta) )?indietro(?: di)? (?<n>NUM) UNIT$",
        '^(?:riavvolgi|riavvolgere)(?: di)? (?<n>NUM) UNIT$',
      ],
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        '^(?:(?:imposta|metti|porta) )?(?:la )?velocità(?: di riproduzione)? (?:a |su )?(?<rate>NUM) ?(?:x|volte)?$',
        '^(?:riproduci )?a (?<rate>NUM) ?x$',
        '^(?<rate>NUM) ?x$',
      ],
      build: rate,
    },
    {
      id: 'speed-named',
      tool: 'playback_speed',
      source: '^(?:(?:metti|imposta|torna) (?:a |alla )?)?(?:velocità (?<named>normale|doppia)|(?:a )?(?<named2>doppia|metà) velocità)$',
      build: (g) => rate({ ...g, named: g.named ?? g.named2 }),
    },
    {
      id: 'like',
      tool: 'like',
      source: [
        '^(?:metti|mettere|lascia|lasciare) (?:un )?(?:mi piace|like|cuore)(?: a (?:questo video|questa foto|questo post))?(?: su (?<app>APPS))?$',
        '^(?:mi piace|like)(?: su (?<app>APPS))?$',
      ],
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?:(?<verb>apri|aprire|mostra|mostrare|chiudi|chiudere|nascondi) )?(?:la )?sfera(?: di controllo)?$',
      build: (g) => ({ action: /^(?:chiud|nascond)/iu.test(g.verb ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:(?:attiva|attivare|disattiva|disattivare|accendi|accendere|spegni|spegnere|apri|aprire) (?:il |la )?)?(?:impostazioni (?:del |della )?)?wi-?fi$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:(?:attiva|attivare|disattiva|disattivare|accendi|accendere|spegni|spegnere|apri|aprire) (?:il |lo )?)?(?:impostazioni (?:del |dello )?)?bluetooth$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source: '^(?:(?:attiva|attivare|disattiva|disattivare|metti|apri) )?(?:la )?(?:modalità )?non disturbare$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    {
      id: 'back',
      tool: 'navigate',
      source: '^(?:indietro|torna indietro|vai indietro|torna)$',
      build: fixed({ action: 'back' }),
    },
    {
      id: 'home',
      tool: 'navigate',
      source: '^(?:(?:vai|torna) (?:alla |sulla )?)?(?:home|schermata home|schermata principale)$',
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:(?:apri|mostra) )?(?:le )?app recenti$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^(?:(?:apri|aprire|mostra|mostrami|fammi vedere) )?(?:le |mie )?notifiche$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^(?:(?:apri|mostra) )?(?:le )?impostazioni rapide$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: '^blocca(?:re)?(?: lo schermo| il telefono)?$',
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: '^(?:(?:fai|fare|cattura) )?(?:uno |una )?(?:screenshot|schermata|cattura (?:dello |di )?schermo)$',
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: "^(?:(?:apri|mostra) )?(?:il )?menu (?:di spegnimento|di accensione|dell'alimentazione)$",
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:pausa|metti in pausa|ferma|fermare|stop|stoppa)(?: il video| la musica| la riproduzione)?$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:riprendi|riproduci|play|continua|fai partire)(?: il video| la musica)?$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:(?:la |il )?(?:prossima|prossimo|successiva|successivo)(?: canzone| brano| video| traccia)?|(?:canzone|brano|video|traccia) successiv[ao]|salta(?: la canzone| il brano)?|avanti)$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:(?:la |il )?precedente(?: canzone| brano| video| traccia)?|(?:canzone|brano|video|traccia) precedente)$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: "^(?:apri|aprire|avvia|avviare|lancia|lanciare|vai su|vai in|entra in)(?: l'applicazione(?= )| l'app(?= ))?(?:(?: il| la| lo| le| gli)(?= )| l')? ?(?<app>.+?)$",
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: [
        "^(?:scorri|scorrere|scrolla|fai scorrere)(?: (?:verso )?(?:il |l'|in )?(?<direction>basso|alto|giù|su|sinistra|destra))?$",
        '^(?:vai )?(?<direction>giù)$',
        '^(?<direction>scendi|sali)$',
      ],
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
  ],
  prefixes: [
    /^(?:(?:ehi|ciao|ok)\s+)?sigil[\s,:!.]*/iu,
    /^(?:per favore|puoi|potresti|riesci a)\s+/iu,
  ],
  suffixes: [/[\s,]+per favore$/iu],
  yes: ['sì', 'si', 'certo', 'va bene', 'conferma', 'confermo', 'invia', 'invialo', 'manda', 'mandalo', 'ok', 'vai', "d'accordo", 'procedi'],
  no: ['no', 'annulla', 'annullare', 'ferma', 'fermati', 'aspetta', 'non ora', 'lascia stare', 'lascia perdere'],
  sensitive: [
    'invia',
    'inviare',
    'pubblica',
    'pubblicare',
    'condividi',
    'condividere',
    'chiama',
    'chiamare',
    'elimina',
    'eliminare',
    'rimuovi',
    'rimuovere',
    'paga',
    'pagare',
    'acquista',
    'acquistare',
    'compra',
    'comprare',
    'ordina',
    'ordinare',
    'abbonati',
    'iscriviti',
    'trasferisci',
    'conferma',
    'confermare',
    'disinstalla',
  ],
  bulk: [
    /(?:^|\s)(?:a\s+)?tutt[ie]\s+(?:i\s+|le\s+|gli\s+)?(?:miei\s+|mie\s+)?(?:contatti|amici|follower|gruppi|chat|persone|post|foto|video|commenti|messaggi)(?:\s|$)/iu,
    /(?:^|\s)a tutti(?:\s|$)/iu,
    /(?:^|\s)\d+\s*volte(?:\s|$)/iu,
    /(?:^|\s)ogni\s+(?:\d+\s+)?(?:secondo|secondi|minuto|minuti|ora|ore|giorno|giorni|mattina|sera)(?:\s|$)/iu,
    /(?:^|\s)in massa(?:\s|$)/iu,
  ],
  severalPeople: [/,|\s(?:e|ed|&|\+)\s/iu],
  askMessageText: (contact) => `Cosa deve dire il messaggio per ${contact}?`,
};
