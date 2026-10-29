import {
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

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'];
const TEENS = ['dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

function frenchNumbers(): [string, number][] {
  const out: [string, number][] = [];
  UNITS.forEach((word, value) => out.push([word, value]));
  TEENS.forEach((word, i) => out.push([word, 10 + i]));
  for (let t = 2; t <= 6; t++) {
    out.push([TENS[t], t * 10]);
    out.push([`${TENS[t]} et un`, t * 10 + 1]);
    for (let u = 2; u < 10; u++) out.push([`${TENS[t]}-${UNITS[u]}`, t * 10 + u]);
  }
  // 70 to 79 count on from sixty, 80 to 99 from four twenties.
  out.push(['soixante et onze', 71]);
  TEENS.forEach((word, i) => i !== 1 && out.push([`soixante-${word}`, 70 + i]));
  out.push(['quatre-vingts', 80], ['quatre-vingt', 80]);
  for (let u = 1; u < 10; u++) out.push([`quatre-vingt-${UNITS[u]}`, 80 + u]);
  TEENS.forEach((word, i) => out.push([`quatre-vingt-${word}`, 90 + i]));
  out.push(['une', 1], ['cent', 100], ['demi', 0.5]);
  return out;
}

const numbers = new NumberWords(frenchNumbers());

const SEND = '(?:envoie|envoies|envoyer|envoyez|écris|écrire|écrivez)';
const TO = "(?:à|a|pour)";
const ON = '(?:sur|par|via|avec|dans)';
const BARE_MESSAGE = /^(?:un )?(?:message|texto|sms)$/iu;
const cleanContact = contactCleaner(/^(?:(?:mon|ma|le|la)\s+|l')/iu);
const sendArgs = (g: Groups) => messageArgs(g, cleanContact, BARE_MESSAGE);

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^(?:le haut|haut|monte|monter)$/iu, 'up'],
  [/^(?:le bas|bas|descends|descendre)$/iu, 'down'],
  [/gauche$/iu, 'left'],
  [/droite$/iu, 'right'],
];

const STREAMS: [RegExp, 'ring' | 'alarm'][] = [
  [/^(?:sonnerie|téléphone|telephone)/iu, 'ring'],
  [/^(?:alarme|réveil|reveil)/iu, 'alarm'],
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
    return { rate: /^normale$/iu.test(g.named) ? 1 : /^double$/iu.test(g.named) ? 2 : 0.5 };
  }
  const value = speedRate(numbers.parse(g.rate));
  return value === null ? null : { rate: value };
}

const UP = '(?:monte|monter|augmente|augmenter|hausse|hausser)';
const DOWN = '(?:baisse|baisser|diminue|diminuer|réduis|réduire)';

export const fr: LanguagePack = {
  id: 'fr',
  code: 'fr',
  vocab: {
    NUM: numbers.pattern(),
    PCT: '(?:\\s*%| pour cent| pourcent)',
    UNIT: '(?<unit>secondes?|minutes?)',
    STREAM: "(?:de (?:la |l')?|du )(?<stream>sonnerie|alarme|réveil)",
  },
  rules: [
    {
      id: 'send-on-app-saying',
      tool: 'send_message',
      source: `^${SEND}(?: un)?(?: message| texto| sms)?(?: ${TO})? (?<contact>.+?) ${ON} (?<app>APPS)(?: en disant que| en disant| disant que| disant| pour dire que| qui dit|:|,)\\s*(?<text>.+)$`,
      build: sendArgs,
    },
    {
      id: 'send-saying',
      tool: 'send_message',
      source: `^${SEND}(?: un)?(?: message| texto| sms)?(?: ${TO})? (?<contact>.+?)(?: en disant que| en disant| disant que| disant| pour dire que| qui dit|:|,)\\s*(?<text>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'tell',
      tool: 'send_message',
      source: `^(?:dis|dites|préviens|prévenez|écris|écrivez)(?: ${TO})? (?<contact>.+?) (?:que |qu')(?<text>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: `^(?:envoie|envoyer|envoyez|écris|écrire)(?: un)? (?:message|texto|sms)(?: ${TO})? (?<contact>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: (g) => ({ question: fr.askMessageText(cleanContact(unquote(g.contact ?? ''))) }),
    },
    {
      id: 'play-on-app',
      tool: 'search',
      source: '^(?:mets|mettre|joue|jouer|lance|regarde|regarder) (?<query>.+?) sur (?<app>APPS)$',
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: '^(?:cherche|chercher|recherche|rechercher|trouve)(?: des| du| de la)? (?<query>.+?)(?: (?:sur|dans) (?<app>APPS))?$',
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source: "^(?:(?:mets|mettre|règle|régler|passe|monte|baisse) )?(?:le )?volume(?: STREAM)? (?:à |au |sur )?(?:(?<level>NUM)PCT?|(?<extreme>maximum|max|minimum|min))$",
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: le)? (?:volume|son)(?: STREAM)?$`,
        '^(?:volume(?: STREAM)? )?(?<word>plus fort|moins fort)$',
      ],
      build: (g) => ({
        action: new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^plus fort$/iu.test(g.word ?? '') ? 'up' : 'down',
        ...stream(g),
      }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: [
        "^(?:coupe|couper)(?: le)? (?:son|volume)$",
        "^(?:(?:mets|mettre|active|activer) (?:le |en )?)?(?:mode )?(?<stream>silencieux|muet)$",
        '^(?:sourdine|silence)$',
      ],
      build: (g) => ({ action: 'mute', ...(g.stream && /silencieux/iu.test(g.stream) ? { stream: 'ring' } : {}) }),
    },
    {
      id: 'unmute',
      tool: 'volume',
      source: "^(?:remets|remettre|réactive|réactiver|rallume|rétablis|rétablir)(?: le)? son$|^(?:désactive|désactiver|enlève|enlever) (?:le )?(?:mode )?(?:muet|sourdine)$",
      build: fixed({ action: 'unmute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source: "^(?:(?:mets|mettre|règle|régler|passe|monte|baisse) )?(?:la )?luminosité(?: de l'écran)? (?:à |au |sur )?(?:(?<level>NUM)PCT?|(?<extreme>maximum|max|minimum|min))$",
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: la)? luminosité(?: de l'écran)?$`,
        "^(?:rends |rendre )?(?:l'écran )?(?<word>plus lumineux|plus clair|plus sombre|moins lumineux)$",
        "^(?<verb2>éclaircis|éclaircir|assombris|assombrir) l'écran$",
      ],
      build: (g) => ({
        action:
          new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^(?:plus lumineux|plus clair)$/iu.test(g.word ?? '') || /^éclairci/iu.test(g.verb2 ?? '')
            ? 'up'
            : 'down',
      }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source: "^(?:avance|avancer|saute|sauter|passe|passer)(?: de| d')? ?(?<n>NUM) UNIT(?: en avant)?$",
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: "^(?:recule|reculer|reviens|revenir|retourne|rembobine|rembobiner)(?: de| d')? ?(?<n>NUM) UNIT(?: en arrière)?$",
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        "^(?:(?:mets|mettre|règle|régler|passe) )?(?:la )?vitesse(?: de lecture)? (?:à |sur |en )?(?:x ?)?(?<rate>NUM) ?(?:x|fois)?$",
        '^(?:lis|lire|lecture|joue)(?: à)? (?:x ?)?(?<rate>NUM) ?x?$',
        '^(?:x ?(?<rate>NUM)|(?<rate2>NUM) ?x)$',
      ],
      build: (g) => rate({ ...g, rate: g.rate ?? g.rate2 }),
    },
    {
      id: 'speed-named',
      tool: 'playback_speed',
      source: '^(?:(?:remets|mets|lis|lecture) (?:à |en )?)?(?:la )?vitesse (?<named>normale|double)$|^(?:à |en )?(?<named2>double|demi)[ -]vitesse$',
      build: (g) => rate({ ...g, named: g.named ?? g.named2 }),
    },
    {
      id: 'like',
      tool: 'like',
      source: [
        "^(?:like|aime|liker)(?: ça| cette vidéo| cette photo| ce post| cette publication)?(?: sur (?<app>APPS))?$",
        "^(?:mets|mettre|laisse|laisser) (?:un )?(?:like|j'aime|cœur|coeur)(?: sur (?<app>APPS))?$",
        "^j'aime(?: ça)?(?: sur (?<app>APPS))?$",
      ],
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?:(?<verb>ouvre|ouvrir|affiche|afficher|montre|ferme|fermer|cache|cacher) )?(?:la )?sphère(?: de contrôle)?$',
      build: (g) => ({ action: /^(?:ferm|cach)/iu.test(g.verb ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:(?:active|activer|désactive|désactiver|allume|allumer|coupe|couper|ouvre|ouvrir) (?:le )?)?(?:paramètres (?:du |de la )?|réglages (?:du )?)?wi-?fi$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:(?:active|activer|désactive|désactiver|allume|allumer|coupe|couper|ouvre|ouvrir) (?:le )?)?(?:paramètres (?:du )?|réglages (?:du )?)?bluetooth$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source: '^(?:(?:active|activer|désactive|désactiver|mets|ouvre) (?:le |en )?)?(?:mode )?ne pas déranger$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    {
      id: 'back',
      tool: 'navigate',
      source: '^(?:retour|reviens|revenir|reviens en arrière|retour en arrière|page précédente)$',
      build: fixed({ action: 'back' }),
    },
    {
      id: 'home',
      tool: 'navigate',
      source: "^(?:(?:va|aller|retourne|reviens) (?:à |a )?l')?(?:accueil|écran d'accueil)$",
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:(?:ouvre|affiche|montre) )?(?:les )?(?:applications|applis|apps) récentes$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^(?:(?:ouvre|ouvrir|affiche|afficher|montre|montre-moi) )?(?:les |mes )?notifications$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^(?:(?:ouvre|affiche) )?(?:les )?(?:réglages|paramètres) rapides$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: "^verrouille(?:r)?(?: l'écran| le téléphone)?$",
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: "^(?:(?:fais|faire|prends|prendre) (?:une )?)?capture d'écran$|^(?:fais|prends) (?:un )?screenshot$",
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: "^(?:(?:ouvre|affiche) )?(?:le )?menu (?:d'alimentation|marche[ /-]arrêt|d'arrêt)$",
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:pause|mets en pause|mettre en pause|arrête|arrêter|stop)(?: la vidéo| la musique| la lecture)?$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:lecture|lance la lecture|reprends|reprendre|continue|continuer|play|relance)(?: la vidéo| la musique| la lecture)?$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:(?:passe à |mets )?(?:la |le )?(?:chanson |morceau |vidéo |titre )?suivante?|(?:chanson|morceau|vidéo|titre) suivante?)$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:(?:reviens à |mets )?(?:la |le )?(?:chanson |morceau |vidéo |titre )?précédente?|(?:chanson|morceau|vidéo|titre) précédente?)$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: "^(?:ouvre|ouvrir|lance|lancer|démarre|démarrer|va sur|va dans|aller sur)(?: l'application(?= )| l'appli(?= ))?(?:(?: les| le| la)(?= )| l')? ?(?<app>.+?)$",
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: [
        '^(?:fais défiler|défile|faire défiler|glisse|glisser|scrolle|scroll)(?: vers)?(?: (?:la )?(?<direction>le haut|le bas|haut|bas|gauche|droite))?$',
        '^(?<direction>descends|descendre|monte|monter)$',
      ],
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
  ],
  prefixes: [
    /^(?:(?:salut|hé|hey|ok)\s+)?sigil[\s,:!.]*/iu,
    /^(?:s'il te plaît|s'il vous plaît|stp|svp|peux-tu|tu peux|pourrais-tu|est-ce que tu peux)\s+/iu,
  ],
  suffixes: [/[\s,]+(?:s'il te plaît|s'il vous plaît|stp|svp)$/iu],
  yes: ['oui', 'ouais', "d'accord", 'vas-y', 'vas y', 'envoie', 'envoie-le', 'publie', 'confirme', 'je confirme', 'ok', 'bien sûr', 'oui envoie'],
  no: ['non', 'annule', 'annuler', 'arrête', 'attends', 'pas maintenant', 'laisse tomber', 'surtout pas'],
  sensitive: [
    'envoyer',
    'envoie',
    'publier',
    'partager',
    'appeler',
    'supprimer',
    'effacer',
    'retirer',
    'payer',
    'acheter',
    'commander',
    'abonner',
    'transférer',
    'virement',
    'confirmer',
    'désinstaller',
  ],
  bulk: [
    /(?:^|\s)(?:à\s+)?(?:tous|toutes)\s+(?:mes\s+|les\s+)?(?:contacts|amis|abonnés|groupes|conversations|discussions|personnes|publications|posts|photos|vidéos|commentaires|messages)(?:\s|$)/iu,
    /(?:^|\s)tout le monde(?:\s|$)/iu,
    /(?:^|\s)\d+\s*fois(?:\s|$)/iu,
    /(?:^|\s)(?:chaque|toutes les|tous les)\s+(?:\d+\s+)?(?:seconde|minute|heure|jour|matin|soir)s?(?:\s|$)/iu,
    /(?:^|\s)en masse(?:\s|$)/iu,
  ],
  severalPeople: [/,|\s(?:et|&|\+)\s/iu],
  askMessageText: (contact) => `Que doit dire le message pour ${contact} ?`,
};
