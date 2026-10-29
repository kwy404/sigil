import type { AppPlace } from '../../app-profiles/schema';
import {
  clockTime,
  compactTime,
  composeNumbers,
  contactCleaner,
  type DayPeriod,
  durationSeconds,
  type DurationUnits,
  fixed,
  hourBefore,
  lookup,
  messageArgs,
  NumberWords,
  percent,
  placeArgs,
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

const PLACES: [RegExp, AppPlace][] = [
  [/^reels?$/iu, 'reels'],
  [/^shorts?$/iu, 'shorts'],
  [/^suscripciones$/iu, 'subscriptions'],
  [/^(?:mensajes directos|mds?|dms?|direct|mensajes|bandeja de entrada|chats)$/iu, 'messages'],
  [/^perfil$/iu, 'profile'],
  [/^explorar$/iu, 'explore'],
];
/** Words that only name a place with an app: "abre los mensajes" opens the messaging app. */
const GENERIC_PLACE = /^(?:mensajes|bandeja de entrada|chats)$/iu;
const SPAN_UNITS: DurationUnits = { hour: /^horas?$/iu, minute: /^min(?:utos?)?$/iu, second: /^seg(?:undos?)?$/iu };

function timerArgs(g: Groups): RuleArgs | null {
  if (g.halfhour) return { seconds: 1800 };
  const seconds = durationSeconds(
    [
      [numbers.parse(g.n1), g.u1],
      [numbers.parse(g.n2), g.u2],
    ],
    SPAN_UNITS,
    Boolean(g.half),
  );
  return seconds === null ? null : { seconds };
}

function minuteOf(word: string | undefined): number | null {
  if (word === undefined) return 0;
  if (/^media$/iu.test(word)) return 30;
  if (/^cuarto$/iu.test(word)) return 15;
  return numbers.parse(word);
}

function alarmArgs(g: Groups): RuleArgs | null {
  const period: DayPeriod = g.period ? (/(?:tarde|noche)$/iu.test(g.period) ? 'pm' : 'am') : null;
  if (g.noon) return clockTime(/noche$/iu.test(g.noon) ? 0 : 12);
  if (g.hm) {
    const time = compactTime(g.hm);
    return time ? clockTime(time[0], time[1], period) : null;
  }
  if (g.less) {
    const less = minuteOf(g.less);
    return less === null ? null : clockTime(hourBefore(numbers.parse(g.h)), 60 - less, period);
  }
  return clockTime(numbers.parse(g.h), minuteOf(g.m), period);
}

export const es: LanguagePack = {
  id: 'es',
  code: 'es',
  vocab: {
    SPAN: '(?:(?<n1>NUM) (?<u1>horas?|minutos?|min|segundos?|seg)(?:(?: y|,) (?<n2>NUM) (?<u2>minutos?|min|segundos?|seg))?(?<half> y media| y medio)?|(?<halfhour>media hora))',
    CLOCK:
      '(?:(?<hm>\\d{1,2}:\\d{2})|(?<h>NUM)(?: horas?)?(?: y (?<m>NUM|media|cuarto)(?: minutos?)?| menos (?<less>cuarto|NUM))?|(?<noon>mediodía|medianoche))(?: (?<period>de la mañana|de la madrugada|de la tarde|de la noche))?',
    DOMAIN: '[a-z0-9-]+(?:(?:\\.| punto )[a-z0-9-]+)*(?:\\.| punto )[a-z]{2,}(?:/[^ ]*)?',
    NUM: numbers.pattern(),
    PCT: '(?:\\s*%| por ciento)',
    UNIT: '(?<unit>segundos?|minutos?)',
    STREAM: '(?:del? (?:la )?)?(?<stream>timbre|tono de llamada|tono|llamadas|alarma|despertador)',
  },
  rules: [
    {
      id: 'place',
      tool: 'open_place',
      source: [
        '^(?:abre|abrir|muestra|muéstrame|mostrar|ve a|ir a|entra (?:a|en)|ver)(?: (?:el|los|la|las|mi|mis))? (?<place>reels?|shorts?|suscripciones|mensajes directos|mds?|dms?|direct|mensajes|bandeja de entrada|perfil|explorar)(?: (?:de|del|en) (?<app>APPS))?$',
        '^(?:los )?(?<place>reels|shorts)(?: (?:de|del|en) (?<app>APPS))?$',
      ],
      build: (g) => placeArgs(g, lookup<AppPlace | ''>(g.place, PLACES, ''), GENERIC_PLACE),
    },
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
      id: 'close-all',
      tool: 'close_all_apps',
      source: [
        '^(?:cierra|cierre|cerrar|limpia|limpiar)(?: todas las| todos los| las| los| todas| todos)(?: mis)? (?:apps|aplicaciones)(?: abiertas| recientes| en segundo plano)?$',
        '^(?:cierra|cierre|cerrar) todo$',
        '^(?:limpia|limpiar|borra|borrar)(?: las)? (?:apps |aplicaciones )?recientes$',
      ],
      build: fixed({}),
    },
    {
      id: 'close-this',
      tool: 'close_app',
      source: [
        '^(?:cierra|cierre|cerrar) (?:esto|esta app|esta aplicación|la app|la aplicación)(?: actual)?$',
        '^(?:sal|salir) (?:de aquí|de esta app|de la app|de esta aplicación|de la aplicación)$',
      ],
      build: fixed({}),
    },
    {
      id: 'previous-app',
      tool: 'navigate',
      source: [
        '^(?:(?:vuelve|volver|regresa|regresar|ve|ir|cambia|cambiar) (?:a la|al|a) )?(?:app|aplicación) anterior$',
        '^(?:(?:vuelve|volver|regresa|regresar|ve|ir) a )?la última (?:app|aplicación)$',
        '^cambia(?:r)? de (?:app|aplicación)$',
      ],
      build: fixed({ action: 'previous_app' }),
    },
    {
      id: 'split-screen',
      tool: 'navigate',
      source: ['^(?:(?:activa|activar|abre|abrir|usa|usar|pon|poner) (?:la )?)?pantalla dividida$', '^divid(?:e|ir) la pantalla$'],
      build: fixed({ action: 'split_screen' }),
    },
    {
      id: 'tutorial',
      tool: 'open_tutorial',
      source: [
        '^(?:(?:abre|abrir|muestra|muéstrame|mostrar|ver|repite|repetir|rehaz|rehacer|haz|hacer|empieza|empezar|inicia|iniciar|reinicia|reiniciar)(?: el)? )?tutorial(?: de nuevo| otra vez)?$',
        '^(?:enséñame|muéstrame) (?:a usar|cómo usar) sigil$',
      ],
      build: fixed({}),
    },
    {
      id: 'timer',
      tool: 'set_timer',
      source: [
        '^(?:(?:pon|ponme|poner|crea|crear|inicia|iniciar|activa|activar|programa|programar)(?: un| el)? )?(?:temporizador|timer|cronómetro|cuenta atrás|cuenta regresiva) (?:de |por |para |a )?SPAN$',
        '^avísame en SPAN$',
      ],
      build: timerArgs,
    },
    {
      id: 'alarm',
      tool: 'set_alarm',
      source: [
        '^(?:(?:pon|ponme|poner|crea|crear|activa|activar|programa|programar)(?: una| la)? )?(?:alarma|despertador) (?:para |a |de )*(?:las |la )?CLOCK$',
        '^(?:despiértame|levántame) (?:a |para )?(?:las |la )?CLOCK$',
      ],
      build: alarmArgs,
    },
    {
      id: 'flashlight',
      tool: 'flashlight',
      source: [
        '^(?<verb>enciende|encender|prende|prender|activa|activar|apaga|apagar|desactiva|desactivar)(?: la| el)? (?:linterna|luz del teléfono|luz del celular|flash)$',
        '^linterna(?: (?<state>encendida|apagada|on|off))?$',
      ],
      build: (g) => ({ on: !/^(?:apag|desactiv)/iu.test(g.verb ?? '') && !/^(?:apagada|off)$/iu.test(g.state ?? '') }),
    },
    {
      id: 'website',
      tool: 'open_website',
      source: [
        '^(?:abre|abrir|ve a|ir a|entra (?:a|en)|visita|visitar)(?: la| el)? (?:página|web|sitio|sitio web|página web) (?<url>.+)$',
        '^(?:abre|abrir|ve a|ir a|entra (?:a|en)|visita|visitar) (?<url>DOMAIN)$',
      ],
      build: (g) => ({ url: unquote(g.url ?? '') }),
    },
    {
      id: 'open-chat',
      tool: 'open_chat',
      source: [
        `^(?:abre|abrir|ve a|entra (?:a|en))(?: el| la)? (?:chat|conversación) (?:con|de) (?<contact>.+?)(?: ${ON} (?<app>APPS))?$`,
        '^(?:abre|abrir) (?:el )?(?<app>whatsapp|telegram|messenger) (?:de|con) (?<contact>.+)$',
      ],
      build: (g) => withApp(g, { contact: cleanContact(unquote(g.contact ?? '')) }),
    },
    {
      id: 'close-app',
      tool: 'close_app',
      source: '^(?:cierra|cierre|cerrar|sal de|salir de|sal del|salir del|mata|matar|fuerza el cierre de|forzar el cierre de)(?: el| la)? (?<app>.+?)$',
      build: (g) => ({ app: (g.app ?? '').trim() }),
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
