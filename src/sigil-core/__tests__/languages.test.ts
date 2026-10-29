import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import {
  ActionPlanner,
  isSensitiveLabel,
  LANGUAGE_PACKS,
  namesSeveralPeople,
  parseAnswer,
  parseRequest,
  RULE_LANGUAGES,
  type RuleLanguage,
} from '..';

const profiles = ProfileRegistry.withBuiltins();
const planner = new ActionPlanner({ profiles });
const apps = planner.knownApps();

type Case = [string, string, Record<string, string | number>];

const LOCALES: Record<RuleLanguage, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ja: 'ja-JP',
  zh: 'zh-CN',
};

/** Core commands every language must understand: open, message, scroll, like, media, seek, speed, back, sphere and the system controls. */
const CASES: Record<RuleLanguage, Case[]> = {
  en: [
    ['open YouTube', 'open_app', { app: 'YouTube' }],
    ['send a message to Ana on WhatsApp saying I am on my way', 'send_message', { app: 'WhatsApp', contact: 'Ana', text: 'I am on my way' }],
    ['tell my mom that dinner is ready', 'send_message', { contact: 'mom', text: 'dinner is ready' }],
    ['scroll down', 'scroll', { direction: 'down' }],
    ['scroll up', 'scroll', { direction: 'up' }],
    ['like this video', 'like', {}],
    ['play', 'media', { action: 'play' }],
    ['pause the video', 'media', { action: 'pause' }],
    ['next song', 'media', { action: 'next' }],
    ['previous track', 'media', { action: 'previous' }],
    ['skip 10 seconds', 'seek', { direction: 'forward', seconds: 10 }],
    ['go back thirty seconds', 'seek', { direction: 'back', seconds: 30 }],
    ['fast forward a minute', 'seek', { direction: 'forward', seconds: 60 }],
    ['speed 1.5', 'playback_speed', { rate: 1.5 }],
    ['play at 2x speed', 'playback_speed', { rate: 2 }],
    ['normal speed', 'playback_speed', { rate: 1 }],
    ['go back', 'navigate', { action: 'back' }],
    ['go home', 'navigate', { action: 'home' }],
    ['show recent apps', 'navigate', { action: 'recents' }],
    ['open notifications', 'navigate', { action: 'notifications' }],
    ['open quick settings', 'navigate', { action: 'quick_settings' }],
    ['lock the screen', 'navigate', { action: 'lock_screen' }],
    ['take a screenshot', 'navigate', { action: 'screenshot' }],
    ['open the power menu', 'navigate', { action: 'power_menu' }],
    ['open the control sphere', 'control_sphere', { action: 'open' }],
    ['close the sphere', 'control_sphere', { action: 'close' }],
    ['turn up the volume', 'volume', { action: 'up' }],
    ['volume down', 'volume', { action: 'down' }],
    ['volume 30%', 'volume', { action: 'set', level: 30 }],
    ['set the alarm volume to fifty percent', 'volume', { action: 'set', level: 50, stream: 'alarm' }],
    ['mute', 'volume', { action: 'mute' }],
    ['unmute', 'volume', { action: 'unmute' }],
    ['turn the ringer volume down', 'volume', { action: 'down', stream: 'ring' }],
    ['louder', 'volume', { action: 'up' }],
    ['brightness up', 'brightness', { action: 'up' }],
    ['dim the screen', 'brightness', { action: 'down' }],
    ['set brightness to 70 percent', 'brightness', { action: 'set', level: 70 }],
    ['turn on wifi', 'settings_panel', { panel: 'wifi' }],
    ['bluetooth on', 'settings_panel', { panel: 'bluetooth' }],
    ['turn on do not disturb', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
  pt: [
    ['abre o YouTube', 'open_app', { app: 'YouTube' }],
    ['manda uma mensagem pra mãe no zap dizendo que estou chegando', 'send_message', { app: 'zap', contact: 'mãe', text: 'estou chegando' }],
    ['diz pra Ana que vou atrasar', 'send_message', { contact: 'Ana', text: 'vou atrasar' }],
    ['rolar para baixo', 'scroll', { direction: 'down' }],
    ['sobe', 'scroll', { direction: 'up' }],
    ['curte esse vídeo', 'like', {}],
    ['dá um like', 'like', {}],
    ['continua', 'media', { action: 'play' }],
    ['pausa', 'media', { action: 'pause' }],
    ['proxima musica', 'media', { action: 'next' }],
    ['música anterior', 'media', { action: 'previous' }],
    ['avança 10 segundos', 'seek', { direction: 'forward', seconds: 10 }],
    ['volta trinta segundos', 'seek', { direction: 'back', seconds: 30 }],
    ['velocidade 1,5', 'playback_speed', { rate: 1.5 }],
    ['velocidade normal', 'playback_speed', { rate: 1 }],
    ['voltar', 'navigate', { action: 'back' }],
    ['tela inicial', 'navigate', { action: 'home' }],
    ['abre as notificacoes', 'navigate', { action: 'notifications' }],
    ['abrir as notificações', 'navigate', { action: 'notifications' }],
    ['tira um print', 'navigate', { action: 'screenshot' }],
    ['bloquear a tela', 'navigate', { action: 'lock_screen' }],
    ['abre o menu de desligar', 'navigate', { action: 'power_menu' }],
    ['abre a esfera de controle', 'control_sphere', { action: 'open' }],
    ['fecha a esfera', 'control_sphere', { action: 'close' }],
    ['aumenta o volume', 'volume', { action: 'up' }],
    ['abaixa o volume do alarme', 'volume', { action: 'down', stream: 'alarm' }],
    ['volume 30%', 'volume', { action: 'set', level: 30 }],
    ['coloca o volume em cinquenta por cento', 'volume', { action: 'set', level: 50 }],
    ['mudo', 'volume', { action: 'mute' }],
    ['tira o mudo', 'volume', { action: 'unmute' }],
    ['aumenta o brilho', 'brightness', { action: 'up' }],
    ['diminui o brilho', 'brightness', { action: 'down' }],
    ['brilho em 70%', 'brightness', { action: 'set', level: 70 }],
    ['liga o wifi', 'settings_panel', { panel: 'wifi' }],
    ['ativa o bluetooth', 'settings_panel', { panel: 'bluetooth' }],
    ['ativa o não perturbe', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
  es: [
    ['abre YouTube', 'open_app', { app: 'YouTube' }],
    ['manda un mensaje a Ana por WhatsApp diciendo que voy en camino', 'send_message', { app: 'WhatsApp', contact: 'Ana', text: 'voy en camino' }],
    ['dile a mi mamá que llego tarde', 'send_message', { contact: 'mamá', text: 'llego tarde' }],
    ['desplázate hacia abajo', 'scroll', { direction: 'down' }],
    ['desliza hacia arriba', 'scroll', { direction: 'up' }],
    ['dale me gusta', 'like', {}],
    ['reproduce', 'media', { action: 'play' }],
    ['pausa', 'media', { action: 'pause' }],
    ['siguiente canción', 'media', { action: 'next' }],
    ['canción anterior', 'media', { action: 'previous' }],
    ['adelanta 10 segundos', 'seek', { direction: 'forward', seconds: 10 }],
    ['retrocede treinta segundos', 'seek', { direction: 'back', seconds: 30 }],
    ['velocidad 1,5', 'playback_speed', { rate: 1.5 }],
    ['velocidad normal', 'playback_speed', { rate: 1 }],
    ['atrás', 'navigate', { action: 'back' }],
    ['pantalla de inicio', 'navigate', { action: 'home' }],
    ['abre las notificaciones', 'navigate', { action: 'notifications' }],
    ['haz una captura de pantalla', 'navigate', { action: 'screenshot' }],
    ['bloquea la pantalla', 'navigate', { action: 'lock_screen' }],
    ['abre el menú de apagado', 'navigate', { action: 'power_menu' }],
    ['abre la esfera de control', 'control_sphere', { action: 'open' }],
    ['cierra la esfera', 'control_sphere', { action: 'close' }],
    ['sube el volumen', 'volume', { action: 'up' }],
    ['baja el volumen de la alarma', 'volume', { action: 'down', stream: 'alarm' }],
    ['volumen al 30%', 'volume', { action: 'set', level: 30 }],
    ['silencia', 'volume', { action: 'mute' }],
    ['quita el silencio', 'volume', { action: 'unmute' }],
    ['sube el brillo', 'brightness', { action: 'up' }],
    ['baja el brillo', 'brightness', { action: 'down' }],
    ['brillo al setenta por ciento', 'brightness', { action: 'set', level: 70 }],
    ['activa el wifi', 'settings_panel', { panel: 'wifi' }],
    ['enciende el bluetooth', 'settings_panel', { panel: 'bluetooth' }],
    ['activa no molestar', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
  fr: [
    ['ouvre YouTube', 'open_app', { app: 'YouTube' }],
    ['ouvre les paramètres', 'open_app', { app: 'paramètres' }],
    ["envoie un message à Ana sur WhatsApp disant que j'arrive", 'send_message', { app: 'WhatsApp', contact: 'Ana', text: "j'arrive" }],
    ["dis à Marie qu'il pleut", 'send_message', { contact: 'Marie', text: 'il pleut' }],
    ['défile vers le bas', 'scroll', { direction: 'down' }],
    ['fais défiler vers le haut', 'scroll', { direction: 'up' }],
    ["mets un j'aime", 'like', {}],
    ['reprends la lecture', 'media', { action: 'play' }],
    ['mets en pause', 'media', { action: 'pause' }],
    ['chanson suivante', 'media', { action: 'next' }],
    ['morceau précédent', 'media', { action: 'previous' }],
    ['avance de 10 secondes', 'seek', { direction: 'forward', seconds: 10 }],
    ['recule de trente secondes', 'seek', { direction: 'back', seconds: 30 }],
    ['vitesse 1,5', 'playback_speed', { rate: 1.5 }],
    ['vitesse normale', 'playback_speed', { rate: 1 }],
    ['retour', 'navigate', { action: 'back' }],
    ["écran d'accueil", 'navigate', { action: 'home' }],
    ['ouvre les notifications', 'navigate', { action: 'notifications' }],
    ["fais une capture d'écran", 'navigate', { action: 'screenshot' }],
    ["verrouille l'écran", 'navigate', { action: 'lock_screen' }],
    ["ouvre le menu d'alimentation", 'navigate', { action: 'power_menu' }],
    ['ouvre la sphère de contrôle', 'control_sphere', { action: 'open' }],
    ['ferme la sphère', 'control_sphere', { action: 'close' }],
    ['monte le volume', 'volume', { action: 'up' }],
    ["baisse le volume de l'alarme", 'volume', { action: 'down', stream: 'alarm' }],
    ['volume à 30 %', 'volume', { action: 'set', level: 30 }],
    ['coupe le son', 'volume', { action: 'mute' }],
    ['remets le son', 'volume', { action: 'unmute' }],
    ['augmente la luminosité', 'brightness', { action: 'up' }],
    ['baisse la luminosité', 'brightness', { action: 'down' }],
    ['luminosité à soixante-dix pour cent', 'brightness', { action: 'set', level: 70 }],
    ['active le wifi', 'settings_panel', { panel: 'wifi' }],
    ['active le bluetooth', 'settings_panel', { panel: 'bluetooth' }],
    ['active le mode ne pas déranger', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
  de: [
    ['öffne YouTube', 'open_app', { app: 'YouTube' }],
    ['YouTube öffnen', 'open_app', { app: 'YouTube' }],
    ['schick Ana auf WhatsApp eine Nachricht: bin unterwegs', 'send_message', { app: 'WhatsApp', contact: 'Ana', text: 'bin unterwegs' }],
    ['sag Ana, dass ich gleich da bin', 'send_message', { contact: 'Ana', text: 'ich gleich da bin' }],
    ['scroll nach unten', 'scroll', { direction: 'down' }],
    ['nach oben scrollen', 'scroll', { direction: 'up' }],
    ['gefällt mir', 'like', {}],
    ['weiter', 'media', { action: 'play' }],
    ['pausieren', 'media', { action: 'pause' }],
    ['nächstes Lied', 'media', { action: 'next' }],
    ['vorheriges Lied', 'media', { action: 'previous' }],
    ['spul 10 Sekunden vor', 'seek', { direction: 'forward', seconds: 10 }],
    ['dreißig Sekunden zurück', 'seek', { direction: 'back', seconds: 30 }],
    ['Geschwindigkeit 1,5', 'playback_speed', { rate: 1.5 }],
    ['normale Geschwindigkeit', 'playback_speed', { rate: 1 }],
    ['zurück', 'navigate', { action: 'back' }],
    ['zum Startbildschirm', 'navigate', { action: 'home' }],
    ['zeig mir die Benachrichtigungen', 'navigate', { action: 'notifications' }],
    ['mach einen Screenshot', 'navigate', { action: 'screenshot' }],
    ['Bildschirm sperren', 'navigate', { action: 'lock_screen' }],
    ['öffne das Ein-/Aus-Menü', 'navigate', { action: 'power_menu' }],
    ['öffne die Steuerungssphäre', 'control_sphere', { action: 'open' }],
    ['schließ die Sphäre', 'control_sphere', { action: 'close' }],
    ['lauter', 'volume', { action: 'up' }],
    ['Weckerlautstärke runter', 'volume', { action: 'down', stream: 'alarm' }],
    ['Lautstärke auf 30 Prozent', 'volume', { action: 'set', level: 30 }],
    ['stummschalten', 'volume', { action: 'mute' }],
    ['Ton wieder an', 'volume', { action: 'unmute' }],
    ['mach heller', 'brightness', { action: 'up' }],
    ['Helligkeit verringern', 'brightness', { action: 'down' }],
    ['Helligkeit auf siebzig Prozent', 'brightness', { action: 'set', level: 70 }],
    ['WLAN einschalten', 'settings_panel', { panel: 'wifi' }],
    ['Bluetooth an', 'settings_panel', { panel: 'bluetooth' }],
    ['bitte nicht stören', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
  it: [
    ['apri YouTube', 'open_app', { app: 'YouTube' }],
    ['apri Lens', 'open_app', { app: 'Lens' }],
    ['manda un messaggio a Marco su WhatsApp dicendo che sto arrivando', 'send_message', { app: 'WhatsApp', contact: 'Marco', text: 'sto arrivando' }],
    ['di a Giulia che arrivo tardi', 'send_message', { contact: 'Giulia', text: 'arrivo tardi' }],
    ['scorri verso il basso', 'scroll', { direction: 'down' }],
    ["scorri verso l'alto", 'scroll', { direction: 'up' }],
    ['metti mi piace', 'like', {}],
    ['riprendi', 'media', { action: 'play' }],
    ['metti in pausa', 'media', { action: 'pause' }],
    ['prossima canzone', 'media', { action: 'next' }],
    ['canzone precedente', 'media', { action: 'previous' }],
    ['vai avanti di 10 secondi', 'seek', { direction: 'forward', seconds: 10 }],
    ['torna indietro di trenta secondi', 'seek', { direction: 'back', seconds: 30 }],
    ['velocità 1,5', 'playback_speed', { rate: 1.5 }],
    ['velocità normale', 'playback_speed', { rate: 1 }],
    ['torna indietro', 'navigate', { action: 'back' }],
    ['vai alla home', 'navigate', { action: 'home' }],
    ['apri le notifiche', 'navigate', { action: 'notifications' }],
    ['fai uno screenshot', 'navigate', { action: 'screenshot' }],
    ['blocca lo schermo', 'navigate', { action: 'lock_screen' }],
    ['apri il menu di spegnimento', 'navigate', { action: 'power_menu' }],
    ['apri la sfera di controllo', 'control_sphere', { action: 'open' }],
    ['chiudi la sfera', 'control_sphere', { action: 'close' }],
    ['alza il volume', 'volume', { action: 'up' }],
    ['abbassa il volume della sveglia', 'volume', { action: 'down', stream: 'alarm' }],
    ['volume al 30%', 'volume', { action: 'set', level: 30 }],
    ['silenzia', 'volume', { action: 'mute' }],
    ['togli il muto', 'volume', { action: 'unmute' }],
    ['alza la luminosità', 'brightness', { action: 'up' }],
    ['abbassa la luminosità', 'brightness', { action: 'down' }],
    ['luminosità al settanta per cento', 'brightness', { action: 'set', level: 70 }],
    ['attiva il wifi', 'settings_panel', { panel: 'wifi' }],
    ['accendi il bluetooth', 'settings_panel', { panel: 'bluetooth' }],
    ['attiva non disturbare', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
  ja: [
    ['YouTubeを開いて', 'open_app', { app: 'YouTube' }],
    ['アナにWhatsAppで「今向かってる」って送って', 'send_message', { app: 'WhatsApp', contact: 'アナ', text: '今向かってる' }],
    ['お母さんにもうすぐ着くって伝えて', 'send_message', { contact: 'お母さん', text: 'もうすぐ着く' }],
    ['下にスクロールして', 'scroll', { direction: 'down' }],
    ['上にスクロール', 'scroll', { direction: 'up' }],
    ['いいねして', 'like', {}],
    ['再生して', 'media', { action: 'play' }],
    ['一時停止', 'media', { action: 'pause' }],
    ['次の曲', 'media', { action: 'next' }],
    ['前の曲', 'media', { action: 'previous' }],
    ['10秒進めて', 'seek', { direction: 'forward', seconds: 10 }],
    ['三十秒戻して', 'seek', { direction: 'back', seconds: 30 }],
    ['1.5倍速', 'playback_speed', { rate: 1.5 }],
    ['等速に戻して', 'playback_speed', { rate: 1 }],
    ['戻って', 'navigate', { action: 'back' }],
    ['ホームに戻って', 'navigate', { action: 'home' }],
    ['通知を開いて', 'navigate', { action: 'notifications' }],
    ['スクショ撮って', 'navigate', { action: 'screenshot' }],
    ['画面をロックして', 'navigate', { action: 'lock_screen' }],
    ['電源メニューを開いて', 'navigate', { action: 'power_menu' }],
    ['コントロールスフィアを開いて', 'control_sphere', { action: 'open' }],
    ['スフィアを閉じて', 'control_sphere', { action: 'close' }],
    ['音量を上げて', 'volume', { action: 'up' }],
    ['アラームの音量を下げて', 'volume', { action: 'down', stream: 'alarm' }],
    ['音量を30%にして', 'volume', { action: 'set', level: 30 }],
    ['ミュートして', 'volume', { action: 'mute' }],
    ['ミュートを解除して', 'volume', { action: 'unmute' }],
    ['明るさを上げてください', 'brightness', { action: 'up' }],
    ['画面を暗くして', 'brightness', { action: 'down' }],
    ['明るさを70%にして', 'brightness', { action: 'set', level: 70 }],
    ['Wi-Fiをオンにして', 'settings_panel', { panel: 'wifi' }],
    ['Bluetoothをオンにして', 'settings_panel', { panel: 'bluetooth' }],
    ['サイレントモードにして', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
  zh: [
    ['打开YouTube', 'open_app', { app: 'YouTube' }],
    ['用WhatsApp给安娜发消息说我马上到', 'send_message', { app: 'WhatsApp', contact: '安娜', text: '我马上到' }],
    ['跟妈妈说我晚点回家', 'send_message', { contact: '妈妈', text: '我晚点回家' }],
    ['向下滚动', 'scroll', { direction: 'down' }],
    ['往上滑', 'scroll', { direction: 'up' }],
    ['给这个视频点赞', 'like', {}],
    ['继续播放', 'media', { action: 'play' }],
    ['暂停', 'media', { action: 'pause' }],
    ['下一首', 'media', { action: 'next' }],
    ['上一首', 'media', { action: 'previous' }],
    ['快进10秒', 'seek', { direction: 'forward', seconds: 10 }],
    ['后退三十秒', 'seek', { direction: 'back', seconds: 30 }],
    ['1.5倍速播放', 'playback_speed', { rate: 1.5 }],
    ['正常速度', 'playback_speed', { rate: 1 }],
    ['返回', 'navigate', { action: 'back' }],
    ['回到主屏幕', 'navigate', { action: 'home' }],
    ['打开通知栏', 'navigate', { action: 'notifications' }],
    ['截屏', 'navigate', { action: 'screenshot' }],
    ['锁屏', 'navigate', { action: 'lock_screen' }],
    ['打开电源菜单', 'navigate', { action: 'power_menu' }],
    ['打开控制球', 'control_sphere', { action: 'open' }],
    ['关闭控制球', 'control_sphere', { action: 'close' }],
    ['调高音量', 'volume', { action: 'up' }],
    ['把闹钟音量调低', 'volume', { action: 'down', stream: 'alarm' }],
    ['音量调到百分之三十', 'volume', { action: 'set', level: 30 }],
    ['静音', 'volume', { action: 'mute' }],
    ['取消静音', 'volume', { action: 'unmute' }],
    ['亮度调高', 'brightness', { action: 'up' }],
    ['调暗屏幕', 'brightness', { action: 'down' }],
    ['亮度调到70%', 'brightness', { action: 'set', level: 70 }],
    ['打开WiFi', 'settings_panel', { panel: 'wifi' }],
    ['打开蓝牙', 'settings_panel', { panel: 'bluetooth' }],
    ['打开勿扰模式', 'settings_panel', { panel: 'do_not_disturb' }],
  ],
};

/** A message request without its text, which must turn into a question in the request's language. */
const ASK_TEXT: Record<RuleLanguage, [string, string]> = {
  en: ['send a message to Ana', 'What should the message to Ana say?'],
  pt: ['manda uma mensagem para a Bia no zap', 'O que a mensagem para Bia deve dizer?'],
  es: ['envía un mensaje a Juan', '¿Qué quieres que diga el mensaje para Juan?'],
  fr: ['envoie un message à Paul', 'Que doit dire le message pour Paul ?'],
  de: ['schick Ana eine Nachricht', 'Was soll in der Nachricht an Ana stehen?'],
  it: ['manda un messaggio a Luca', 'Cosa deve dire il messaggio per Luca?'],
  ja: ['アナにメッセージを送って', 'アナへのメッセージは何と送りますか？'],
  zh: ['给安娜发消息', '要给安娜发什么内容？'],
};

/** Bulk requests the policy refuses in every language. */
const BULK: Record<RuleLanguage, string[]> = {
  en: ['send happy new year to all my contacts on WhatsApp', 'like all posts on Instagram', 'send hi to Ana 50 times'],
  pt: ['manda bom dia pra todo mundo no zap', 'curtir todas as fotos dela', 'manda oi pra Ana 10 vezes'],
  es: ['manda feliz año a todos mis contactos', 'dale me gusta a todas las fotos', 'manda hola a Ana 20 veces'],
  fr: ['envoie bonne année à tous mes contacts', 'envoie un message à tout le monde', 'envoie salut à Paul 30 fois'],
  de: ['schick allen meinen Kontakten frohes neues Jahr', 'like alle Fotos von ihr', 'schick Ana 20 mal hallo'],
  it: ['manda auguri a tutti i miei contatti', 'metti mi piace a tutte le foto', 'manda ciao a Luca 15 volte'],
  ja: ['全員に「あけおめ」って送って', 'すべての写真にいいねして', 'アナに10回送って'],
  zh: ['给所有联系人发新年快乐', '群发消息说新年快乐', '给安娜发十次消息'],
};

/** Control labels that send, post, pay or delete, which always stop for a yes. */
const SENSITIVE: Record<RuleLanguage, string[]> = {
  en: ['Send', 'Buy now'],
  pt: ['Publicar agora', 'Comprar'],
  es: ['Enviar', 'Eliminar mensaje'],
  fr: ['Envoyer', "S'abonner"],
  de: ['Senden', 'Löschen'],
  it: ['Invia', 'Acquista ora'],
  ja: ['送信', '削除する'],
  zh: ['发送', '立即购买'],
};

/** Contacts that name several people, refused because Sigil messages one person at a time. */
const SEVERAL: Record<RuleLanguage, [string, string]> = {
  en: ['Ana and Bruno', 'Ana Souza'],
  pt: ['Ana e Bruno', 'Ana Souza'],
  es: ['Ana y Juan', 'Ana María'],
  fr: ['Marie et Paul', 'Marie Curie'],
  de: ['Ana und Ben', 'Anna Lena'],
  it: ['Marco e Giulia', 'Marco Rossi'],
  ja: ['アナとボブ', 'まことさん'],
  zh: ['小明和小红', '王和平'],
};

/** Answers to a confirmation: confirm, cancel, and something that is not a yes. */
const ANSWERS: Record<RuleLanguage, { yes: string[]; no: string[]; unclear: string[] }> = {
  en: { yes: ['yes', 'Yes please.', 'send it'], no: ['no', 'cancel', 'yes, no wait'], unclear: ['maybe', 'send it to Bruno instead'] },
  pt: { yes: ['sim', 'Sim, pode mandar', 'confirma'], no: ['não', 'cancela', 'sim, não, espera'], unclear: ['talvez', 'depois eu vejo'] },
  es: { yes: ['sí', 'claro', 'Vale, envíalo'], no: ['no', 'cancela', 'espera'], unclear: ['quizás', 'a lo mejor'] },
  fr: { yes: ['oui', "d'accord", 'oui, envoie'], no: ['non', 'annule', 'attends'], unclear: ['peut-être', 'je ne sais pas trop'] },
  de: { yes: ['ja', 'Ja bitte', 'abschicken'], no: ['nein', 'abbrechen', 'warte'], unclear: ['vielleicht', 'mal sehen'] },
  it: { yes: ['sì', 'va bene', 'conferma'], no: ['no', 'annulla', 'aspetta'], unclear: ['forse', 'vediamo'] },
  ja: { yes: ['はい', 'うん、送って', 'お願いします'], no: ['いいえ', 'キャンセル', 'ううん'], unclear: ['どうしようかな', 'あとで'] },
  zh: { yes: ['是的', '好的，发吧', '确认'], no: ['不要', '取消', '等一下'], unclear: ['也许吧', '我想想'] },
};

describe('language packs', () => {
  it('cover the eight app languages', () => {
    expect(LANGUAGE_PACKS.map((pack) => pack.id)).toEqual([...RULE_LANGUAGES]);
    expect(RULE_LANGUAGES).toEqual(['en', 'pt', 'es', 'fr', 'de', 'it', 'ja', 'zh']);
  });
});

describe.each(RULE_LANGUAGES.map((language) => [language] as const))('voice requests in %s', (language) => {
  const locale = LOCALES[language];

  it.each(CASES[language])('reads "%s"', (text, tool, args) => {
    const match = parseRequest(text, apps, locale);
    expect(match && { tool: match.tool, args: match.args }).toEqual({ tool, args });
  });

  it('turns every core command into a plan', async () => {
    for (const [text, tool] of CASES[language]) {
      const outcome = await planner.plan({ text, locale, foregroundPackage: tool === 'like' ? 'com.google.android.youtube' : null });
      expect({ text, status: outcome.status }).toEqual({ text, status: 'planned' });
    }
  });

  it('asks what to write when a message has no text, in the same language', () => {
    const [text, question] = ASK_TEXT[language];
    expect(parseRequest(text, apps, locale)).toMatchObject({ tool: 'clarify', args: { question }, language });
  });

  it('refuses bulk requests', async () => {
    for (const text of BULK[language]) {
      expect({ text, status: (await planner.plan({ text, locale })).status }).toEqual({ text, status: 'blocked' });
    }
  });

  it('marks the labels that send, post, pay or delete as sensitive', () => {
    for (const label of SENSITIVE[language]) {
      expect({ label, sensitive: isSensitiveLabel(label) }).toEqual({ label, sensitive: true });
    }
  });

  it('notices a contact that names several people', () => {
    const [several, one] = SEVERAL[language];
    expect(namesSeveralPeople(several)).toBe(true);
    expect(namesSeveralPeople(one)).toBe(false);
  });

  it('confirms only on an explicit yes and lets a cancel word win', () => {
    const { yes, no, unclear } = ANSWERS[language];
    for (const answer of yes) expect({ answer, parsed: parseAnswer(answer) }).toEqual({ answer, parsed: 'yes' });
    for (const answer of no) expect({ answer, parsed: parseAnswer(answer) }).toEqual({ answer, parsed: 'no' });
    for (const answer of unclear) expect({ answer, parsed: parseAnswer(answer) }).toEqual({ answer, parsed: null });
  });
});

describe('language order', () => {
  it('tries the language of the locale first', () => {
    // "pausa" is Portuguese, Spanish and Italian; every pack reads it the same way.
    expect(parseRequest('pausa', apps, 'it-IT')).toMatchObject({ tool: 'media', language: 'it' });
    expect(parseRequest('pausa', apps, 'es')).toMatchObject({ tool: 'media', language: 'es' });
  });

  it('still understands a request in another language than the locale', () => {
    expect(parseRequest('音量を上げて', apps, 'en-US')).toMatchObject({ tool: 'volume', args: { action: 'up' }, language: 'ja' });
    expect(parseRequest('lauter', apps, 'pt-BR')).toMatchObject({ tool: 'volume', language: 'de' });
  });

  it('reads full width digits and percent signs', () => {
    expect(parseRequest('音量を３０％にして', apps, 'ja')?.args).toEqual({ action: 'set', level: 30 });
  });

  it('keeps the same policy for speeds that look like repeats', async () => {
    expect((await planner.plan({ text: 'play at 2x speed' })).status).toBe('planned');
    expect((await planner.plan({ text: 'send hi to Ana 10x' })).status).toBe('blocked');
  });
});
