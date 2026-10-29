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

const UNITS = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
const TWENTIES = ['veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];

const numbers = new NumberWords(
  composeNumbers({
    units: UNITS,
    teens: ['diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'],
    tens: ['', '', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'],
    compose: (ten, unit, u, t) => (t === 2 ? [TWENTIES[u - 1]] : [`${ten} y ${unit}`]),
    extra: [
      ['un', 1],
      ['una', 1],
      ['veintiún', 21],
      ['cien', 100],
      ['medio', 0.5],
    ],
  }),
);

const SEND = '(?:manda|mándale|mandar|mándalo|envía|envíale|enviar|escribe|escríbele|escribir)';
const TO = '(?:a|al|para)';
const ON = '(?:por|en|vía|con|usando)';
const BARE_MESSAGE = /^(?:un )?(?:mensaje|msj|texto)$/iu;
const cleanContact = contactCleaner(/^(?:mi|el|la)\s+/iu);
const sendArgs = (g: Groups) => messageArgs(g, cleanContact, BARE_MESSAGE);

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^(?:arriba|sube|subir)$/iu, 'up'],
  [/^(?:abajo|baja|bajar)$/iu, 'down'],
  [/izquierda$/iu, 'left'],
  [/derecha$/iu, 'right'],
];

const STREAMS: [RegExp, 'ring' | 'alarm'][] = [
  [/^(?:timbre|tono|llamadas|teléfono|telefono)/iu, 'ring'],
  [/^(?:alarma|despertador)/iu, 'alarm'],
];

function stream(g: Groups): { stream?: 'ring' | 'alarm' } {
  if (!g.stream) return {};
  const value = lookup<'media' | 'ring' | 'alarm'>(g.stream, STREAMS, 'media');
  return value === 'media' ? {} : { stream: value };
}

function levelArgs(tool: 'volume' | 'brightness', g: Groups): RuleArgs | null {
  const level = g.extreme ? (/^m[áa]x/iu.test(g.extreme) ? 100 : 0) : percent(numbers.parse(g.level));
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
    return { rate: /^normal$/iu.test(g.named) ? 1 : /^doble$/iu.test(g.named) ? 2 : 0.5 };
  }
  const value = speedRate(numbers.parse(g.rate));
  return value === null ? null : { rate: value };
}

const UP = '(?:sube|subir|súbele|aumenta|aumentar|auméntale|eleva|elevar)';
const DOWN = '(?:baja|bajar|bájale|disminuye|disminuir|reduce|reducir)';

export const es: LanguagePack = {
  id: 'es',
  code: 'es',
  vocab: {
    NUM: numbers.pattern(),
    PCT: '(?:\\s*%| por ciento)',
    UNIT: '(?<unit>segundos?|minutos?)',
    STREAM: '(?:del? (?:la )?)?(?<stream>timbre|tono de llamada|tono|llamadas|alarma|despertador)',
  },
  rules: [
    {
      id: 'send-on-app-saying',
      tool: 'send_message',
      source: `^${SEND}(?: un)?(?: mensaje)?(?: ${TO})? (?<contact>.+?) ${ON} (?<app>APPS)(?: diciendo que| diciendo| que diga| que dice| que|:|,)\\s*(?<text>.+)$`,
      build: sendArgs,
    },
    {
      id: 'send-saying',
      tool: 'send_message',
      source: `^${SEND}(?: un)?(?: mensaje)?(?: ${TO})? (?<contact>.+?)(?: diciendo que| diciendo| que diga| que dice| que|:|,)\\s*(?<text>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'tell',
      tool: 'send_message',
      source: `^(?:dile|decile|dígale|avísale|avisa|cuéntale|escríbele)(?: ${TO})? (?<contact>.+?) que (?<text>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: `^(?:manda|mandar|envía|enviar|escribe|escribir)(?: un)? mensaje(?: ${TO})? (?<contact>.+?)(?: ${ON} (?<app>APPS))?$`,
      build: (g) => ({ question: es.askMessageText(cleanContact(unquote(g.contact ?? ''))) }),
    },
    {
      id: 'play-on-app',
      tool: 'search',
      source: '^(?:pon|poner|reproduce|reproducir|toca|ver|mira) (?<query>.+?) en (?<app>APPS)$',
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: '^(?:busca|buscar|búscame|investiga)(?: por)? (?<query>.+?)(?: en (?<app>APPS))?$',
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source: '^(?:(?:pon|poner|ponle|deja|dejar|ajusta|ajustar|cambia|sube|baja) )?(?:el )?volumen(?: STREAM)? (?:al? |en |hasta el )?(?:(?<level>NUM)PCT?|(?<extreme>máximo|mínimo))$',
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: el)? volumen(?: STREAM)?$`,
        '^(?:volumen(?: STREAM)? )?(?<word>más alto|más bajo)$',
        '^(?<word>sube|baja) el sonido$',
      ],
      build: (g) => ({
        action: new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^(?:más alto|sube)$/iu.test(g.word ?? '') ? 'up' : 'down',
        ...stream(g),
      }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: [
        '^(?:silencia|silenciar|silencio|mutea|mutear|quita el sonido|quitar el sonido|apaga el sonido)(?: el)?(?: (?<stream>teléfono|móvil|celular|timbre))?$',
        '^(?:(?:pon|activa|activar) (?:el )?)?modo (?<stream>silencio)$',
      ],
      build: (g) => ({ action: 'mute', ...(g.stream ? { stream: 'ring' } : {}) }),
    },
    {
      id: 'unmute',
      tool: 'volume',
      source: '^(?:quita el silencio|quitar el silencio|activa el sonido|activar el sonido|desmutea|desmutear|devuelve el sonido)$',
      build: fixed({ action: 'unmute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source: '^(?:(?:pon|poner|ponle|deja|ajusta|cambia|sube|baja) )?(?:el )?brillo(?: de la pantalla)? (?:al? |en |hasta el )?(?:(?<level>NUM)PCT?|(?<extreme>máximo|mínimo))$',
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        `^(?<verb>${UP}|${DOWN})(?: el)? brillo(?: de la pantalla)?$`,
        '^(?<verb2>aclara|aclarar|oscurece|oscurecer)(?: la)? pantalla$',
        '^(?:pantalla )?(?<word>más clara|más oscura|más brillante)$',
      ],
      build: (g) => ({
        action:
          new RegExp(`^${UP}$`, 'iu').test(g.verb ?? '') || /^aclar/iu.test(g.verb2 ?? '') || /(?:clara|brillante)$/iu.test(g.word ?? '')
            ? 'up'
            : 'down',
      }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source: '^(?:adelanta|adelantar|avanza|avanzar|salta|saltar)(?: hacia adelante)? (?<n>NUM) UNIT(?: hacia adelante)?$',
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: '^(?:retrocede|retroceder|atrasa|atrasar|regresa|regresar|vuelve|volver|rebobina|rebobinar)(?: hacia atrás)? (?<n>NUM) UNIT(?: hacia atrás| atrás)?$',
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        '^(?:(?:pon|poner|cambia|ajusta) )?(?:la )?velocidad(?: de reproducción)? (?:a |en |al )?(?<rate>NUM) ?(?:x|veces)?$',
        '^(?:reproduce|reproducir|pon(?:lo|la)?) a (?<rate>NUM) ?x$',
        '^(?<rate>NUM) ?x$',
      ],
      build: rate,
    },
    {
      id: 'speed-named',
      tool: 'playback_speed',
      source: '^(?:(?:pon|poner|vuelve|reproduce) (?:a |la |en )?)?(?:velocidad (?<named>normal|doble)|(?:a )?(?<named2>doble|media) velocidad)$',
      build: (g) => rate({ ...g, named: g.named ?? g.named2 }),
    },
    {
      id: 'like',
      tool: 'like',
      source: [
        '^(?:dale|darle|da|pon|ponle|deja) (?:un )?(?:like|me gusta)(?: a (?:esto|este video|esta foto|esta publicación))?(?: en (?<app>APPS))?$',
        '^(?:me gusta|like)(?: en (?<app>APPS))?$',
      ],
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?:(?<verb>abre|abrir|muestra|mostrar|cierra|cerrar|oculta|ocultar) )?(?:la )?esfera(?: de control)?$',
      build: (g) => ({ action: /^(?:cierr|cerrar|ocult)/iu.test(g.verb ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:(?:activa|activar|desactiva|desactivar|enciende|encender|apaga|apagar|abre|abrir|conecta) (?:el |la )?)?(?:ajustes (?:de |del )?|configuración (?:de |del )?)?(?:wi-?fi|red wifi)$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:(?:activa|activar|desactiva|desactivar|enciende|encender|apaga|apagar|abre|abrir) (?:el )?)?(?:ajustes (?:de |del )?|configuración (?:de |del )?)?bluetooth$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source: '^(?:(?:activa|activar|desactiva|desactivar|pon|poner|abre|quita) (?:el )?)?(?:modo )?no molestar$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    {
      id: 'back',
      tool: 'navigate',
      source: '^(?:atrás|ve atrás|volver|vuelve|vuelve atrás|regresa|regresar|ir atrás)$',
      build: fixed({ action: 'back' }),
    },
    {
      id: 'home',
      tool: 'navigate',
      source: '^(?:(?:ve|ir|vuelve|volver) (?:al |a la )?)?(?:inicio|pantalla de inicio|pantalla principal)$',
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:(?:abre|muestra|mostrar) )?(?:las )?(?:apps |aplicaciones )?recientes$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^(?:(?:abre|abrir|muestra|mostrar|enséñame|ver) )?(?:las |mis )?notificaciones$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^(?:(?:abre|abrir|muestra) )?(?:los |la )?(?:ajustes rápidos|configuración rápida)$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: '^bloquea(?:r)?(?: la pantalla| el teléfono| el móvil| el celular)?$',
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: '^(?:(?:haz|hacer|toma|tomar|saca|sacar) (?:una )?)?captura(?: de pantalla)?$|^(?:haz|toma|saca) (?:un )?(?:pantallazo|screenshot)$',
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: '^(?:(?:abre|abrir|muestra|mostrar) )?(?:el )?menú de (?:apagado|encendido)$',
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:pausa|pausar|pon pausa|detén|detener|para)(?: el video| la música| la canción| la reproducción)?$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:reproduce|reproducir|reanuda|reanudar|continúa|continuar|sigue|dale play|play)(?: el video| la música| la canción)?$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:(?:pon |pasa a )?(?:la )?siguiente(?: canción| pista)?|(?:el )?siguiente video|(?:pasa|salta)(?: la)? canción)$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:(?:pon |vuelve a )?(?:la |el )?(?:canción |video |pista )?anterior)$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: '^(?:abre|abrir|ábreme|inicia|iniciar|lanza|ejecuta|entra (?:a|en)|ve a|ir a)(?: el| la)?(?: app de| aplicación de)? (?<app>.+?)$',
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: [
        '^(?:desplaza|desplazar|desplázate|desliza|deslizar|desliza la pantalla|haz scroll|scroll)(?: hacia| para)?(?: (?:la )?(?<direction>arriba|abajo|izquierda|derecha))?$',
        '^(?<direction>baja|bajar|sube|subir)$',
      ],
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
  ],
  prefixes: [
    /^(?:(?:hola|oye|ey|ok)\s+)?sigil[\s,:!.]*/iu,
    /^(?:por favor|puedes|podrías|podrias)\s+/iu,
  ],
  suffixes: [/[\s,]+por favor$/iu],
  yes: ['sí', 'si', 'claro', 'vale', 'dale', 'envíalo', 'mándalo', 'publícalo', 'confirmo', 'confirma', 'de acuerdo', 'ok', 'adelante'],
  no: ['no', 'cancela', 'cancelar', 'para', 'espera', 'ahora no', 'déjalo', 'mejor no'],
  sensitive: [
    'enviar',
    'envía',
    'publicar',
    'compartir',
    'llamar',
    'eliminar',
    'borrar',
    'quitar',
    'pagar',
    'comprar',
    'suscribirse',
    'suscribir',
    'transferir',
    'confirmar',
    'desinstalar',
  ],
  bulk: [
    /(?:^|\s)(?:a\s+)?(?:todos|todas)\s+(?:mis\s+|los\s+|las\s+)?(?:contactos|amigos|seguidores|grupos|chats|conversaciones|personas|publicaciones|posts|fotos|vídeos|videos|comentarios|mensajes)(?:\s|$)/iu,
    /(?:^|\s)todo el mundo(?:\s|$)/iu,
    /(?:^|\s)\d+\s*veces(?:\s|$)/iu,
    /(?:^|\s)cada\s+(?:\d+\s+)?(?:segundo|minuto|hora|día|mañana|noche)s?(?:\s|$)/iu,
    /(?:^|\s)(?:en masa|masivamente)(?:\s|$)/iu,
  ],
  severalPeople: [/,|\s(?:y|e|&|\+)\s/iu],
  askMessageText: (contact) => `¿Qué quieres que diga el mensaje para ${contact}?`,
};
