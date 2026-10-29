import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner, parseRequest, RULE_LANGUAGES, type InstalledApp, type RuleLanguage } from '..';

const profiles = ProfileRegistry.withBuiltins();

const PHONE: InstalledApp[] = [
  { label: 'Instagram', packageName: 'com.instagram.android' },
  { label: 'Instagram Lite', packageName: 'com.instagram.lite' },
  { label: 'WhatsApp', packageName: 'com.whatsapp' },
  { label: 'YouTube', packageName: 'com.google.android.youtube' },
  { label: 'Spotify', packageName: 'com.spotify.music' },
  { label: 'WeChat', packageName: 'com.tencent.mm' },
  { label: 'LINE', packageName: 'jp.naver.line.android' },
];

const planner = new ActionPlanner({ profiles, installedApps: () => PHONE });
const apps = planner.knownApps();

type Case = [string, string, Record<string, string | number | boolean>];

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

/** Opening, closing and switching apps, places inside apps, timers, alarms, the flashlight, websites and the tutorial. */
const CASES: Record<RuleLanguage, Case[]> = {
  en: [
    ['open Spotify', 'open_app', { app: 'Spotify' }],
    ['close Instagram', 'close_app', { app: 'Instagram' }],
    ['close this app', 'close_app', {}],
    ['close all apps', 'close_all_apps', {}],
    ['go back to the previous app', 'navigate', { action: 'previous_app' }],
    ['split screen', 'navigate', { action: 'split_screen' }],
    ['open the reels', 'open_place', { place: 'reels' }],
    ['show YouTube shorts', 'open_place', { place: 'shorts', app: 'YouTube' }],
    ['open my profile on Instagram', 'open_place', { place: 'profile', app: 'Instagram' }],
    ['open the chat with Ana on WhatsApp', 'open_chat', { contact: 'Ana', app: 'WhatsApp' }],
    ['set a timer for 5 minutes', 'set_timer', { seconds: 300 }],
    ['timer for 1 hour and 30 minutes', 'set_timer', { seconds: 5400 }],
    ['set an alarm for 7:30 am', 'set_alarm', { hour: 7, minute: 30 }],
    ['wake me up at seven pm', 'set_alarm', { hour: 19, minute: 0 }],
    ['set an alarm for quarter to eight', 'set_alarm', { hour: 7, minute: 45 }],
    ['turn on the flashlight', 'flashlight', { on: true }],
    ['torch off', 'flashlight', { on: false }],
    ['go to wikipedia.org', 'open_website', { url: 'wikipedia.org' }],
    ['redo the tutorial', 'open_tutorial', {}],
  ],
  pt: [
    ['entra no WhatsApp', 'open_app', { app: 'WhatsApp' }],
    ['vai pro Spotify', 'open_app', { app: 'Spotify' }],
    ['fecha o Instagram', 'close_app', { app: 'Instagram' }],
    ['sai do YouTube', 'close_app', { app: 'YouTube' }],
    ['fecha esse app', 'close_app', {}],
    ['fecha todos os apps', 'close_all_apps', {}],
    ['volta pro app anterior', 'navigate', { action: 'previous_app' }],
    ['tela dividida', 'navigate', { action: 'split_screen' }],
    ['abre os reels', 'open_place', { place: 'reels' }],
    ['abre as inscrições do YouTube', 'open_place', { place: 'subscriptions', app: 'YouTube' }],
    ['abre o direct do Instagram', 'open_place', { place: 'messages', app: 'Instagram' }],
    ['abre a conversa com a Ana no zap', 'open_chat', { contact: 'Ana', app: 'zap' }],
    ['abre o zap da Ana', 'open_chat', { app: 'zap', contact: 'Ana' }],
    ['coloca um timer de 10 minutos', 'set_timer', { seconds: 600 }],
    ['timer de uma hora e meia', 'set_timer', { seconds: 5400 }],
    ['me acorda às 7 e meia', 'set_alarm', { hour: 7, minute: 30 }],
    ['alarme para as 6 da tarde', 'set_alarm', { hour: 18, minute: 0 }],
    ['liga a lanterna', 'flashlight', { on: true }],
    ['desliga a lanterna', 'flashlight', { on: false }],
    ['abre o site g1 ponto com ponto br', 'open_website', { url: 'g1 ponto com ponto br' }],
    ['refazer o tutorial', 'open_tutorial', {}],
  ],
  es: [
    ['abre Spotify', 'open_app', { app: 'Spotify' }],
    ['cierra Instagram', 'close_app', { app: 'Instagram' }],
    ['sal de YouTube', 'close_app', { app: 'YouTube' }],
    ['cierra esta app', 'close_app', {}],
    ['cierra todas las apps', 'close_all_apps', {}],
    ['vuelve a la app anterior', 'navigate', { action: 'previous_app' }],
    ['pantalla dividida', 'navigate', { action: 'split_screen' }],
    ['abre los reels', 'open_place', { place: 'reels' }],
    ['muéstrame los shorts de YouTube', 'open_place', { place: 'shorts', app: 'YouTube' }],
    ['abre el chat con Ana en WhatsApp', 'open_chat', { contact: 'Ana', app: 'WhatsApp' }],
    ['pon un temporizador de 5 minutos', 'set_timer', { seconds: 300 }],
    ['pon una alarma a las 7 y media', 'set_alarm', { hour: 7, minute: 30 }],
    ['despiértame a las 8 menos cuarto', 'set_alarm', { hour: 7, minute: 45 }],
    ['enciende la linterna', 'flashlight', { on: true }],
    ['apaga la linterna', 'flashlight', { on: false }],
    ['ve a wikipedia.org', 'open_website', { url: 'wikipedia.org' }],
    ['repite el tutorial', 'open_tutorial', {}],
  ],
  fr: [
    ['ouvre Spotify', 'open_app', { app: 'Spotify' }],
    ['ferme Instagram', 'close_app', { app: 'Instagram' }],
    ["ferme l'appli", 'close_app', {}],
    ['ferme toutes les applications', 'close_all_apps', {}],
    ["retourne à l'application précédente", 'navigate', { action: 'previous_app' }],
    ['écran partagé', 'navigate', { action: 'split_screen' }],
    ['ouvre les reels', 'open_place', { place: 'reels' }],
    ['montre les shorts de YouTube', 'open_place', { place: 'shorts', app: 'YouTube' }],
    ['ouvre la conversation avec Ana sur WhatsApp', 'open_chat', { contact: 'Ana', app: 'WhatsApp' }],
    ['mets un minuteur de 10 minutes', 'set_timer', { seconds: 600 }],
    ['réveille-moi à 7 h 30', 'set_alarm', { hour: 7, minute: 30 }],
    ['mets une alarme à 6 heures du soir', 'set_alarm', { hour: 18, minute: 0 }],
    ['allume la lampe torche', 'flashlight', { on: true }],
    ['éteins la torche', 'flashlight', { on: false }],
    ['va sur wikipedia.org', 'open_website', { url: 'wikipedia.org' }],
    ['refais le tutoriel', 'open_tutorial', {}],
  ],
  de: [
    ['öffne Spotify', 'open_app', { app: 'Spotify' }],
    ['schließe Instagram', 'close_app', { app: 'Instagram' }],
    ['YouTube schließen', 'close_app', { app: 'YouTube' }],
    ['schließe diese App', 'close_app', {}],
    ['schließe alle Apps', 'close_all_apps', {}],
    ['zurück zur letzten App', 'navigate', { action: 'previous_app' }],
    ['geteilter Bildschirm', 'navigate', { action: 'split_screen' }],
    ['öffne die Reels', 'open_place', { place: 'reels' }],
    ['zeig mir die Shorts von YouTube', 'open_place', { place: 'shorts', app: 'YouTube' }],
    ['öffne den Chat mit Ana auf WhatsApp', 'open_chat', { contact: 'Ana', app: 'WhatsApp' }],
    ['stell einen Timer auf 5 Minuten', 'set_timer', { seconds: 300 }],
    ['weck mich um 7 Uhr 30', 'set_alarm', { hour: 7, minute: 30 }],
    ['stell den Wecker auf halb acht', 'set_alarm', { hour: 7, minute: 30 }],
    ['Taschenlampe an', 'flashlight', { on: true }],
    ['schalte die Taschenlampe aus', 'flashlight', { on: false }],
    ['öffne wikipedia.org', 'open_website', { url: 'wikipedia.org' }],
    ['Tutorial nochmal starten', 'open_tutorial', {}],
  ],
  it: [
    ['apri Spotify', 'open_app', { app: 'Spotify' }],
    ['chiudi Instagram', 'close_app', { app: 'Instagram' }],
    ["chiudi l'app", 'close_app', {}],
    ['chiudi tutte le app', 'close_all_apps', {}],
    ["torna all'app precedente", 'navigate', { action: 'previous_app' }],
    ['schermo diviso', 'navigate', { action: 'split_screen' }],
    ['apri i reels', 'open_place', { place: 'reels' }],
    ['mostrami gli shorts di YouTube', 'open_place', { place: 'shorts', app: 'YouTube' }],
    ['apri la chat con Ana su WhatsApp', 'open_chat', { contact: 'Ana', app: 'WhatsApp' }],
    ['imposta un timer di 5 minuti', 'set_timer', { seconds: 300 }],
    ['svegliami alle 7 e mezza', 'set_alarm', { hour: 7, minute: 30 }],
    ['metti una sveglia alle 6 di sera', 'set_alarm', { hour: 18, minute: 0 }],
    ['accendi la torcia', 'flashlight', { on: true }],
    ['spegni la torcia', 'flashlight', { on: false }],
    ['vai su wikipedia.org', 'open_website', { url: 'wikipedia.org' }],
    ['rifai il tutorial', 'open_tutorial', {}],
  ],
  ja: [
    ['Spotifyを開いて', 'open_app', { app: 'Spotify' }],
    ['インスタを閉じて', 'close_app', { app: 'インスタ' }],
    ['アプリを閉じて', 'close_app', {}],
    ['すべてのアプリを閉じて', 'close_all_apps', {}],
    ['前のアプリに戻って', 'navigate', { action: 'previous_app' }],
    ['画面分割して', 'navigate', { action: 'split_screen' }],
    ['リールを開いて', 'open_place', { place: 'reels' }],
    ['YouTubeのショートを見せて', 'open_place', { place: 'shorts', app: 'YouTube' }],
    ['WhatsAppでAnaさんとのチャットを開いて', 'open_chat', { contact: 'Ana', app: 'WhatsApp' }],
    ['5分のタイマーをセットして', 'set_timer', { seconds: 300 }],
    ['1時間半のタイマー', 'set_timer', { seconds: 5400 }],
    ['7時半に起こして', 'set_alarm', { hour: 7, minute: 30 }],
    ['午後6時にアラームをセットして', 'set_alarm', { hour: 18, minute: 0 }],
    ['ライトをつけて', 'flashlight', { on: true }],
    ['ライトを消して', 'flashlight', { on: false }],
    ['wikipedia.orgを開いて', 'open_website', { url: 'wikipedia.org' }],
    ['チュートリアルをもう一度見せて', 'open_tutorial', {}],
  ],
  zh: [
    ['打开Spotify', 'open_app', { app: 'Spotify' }],
    ['关闭微信', 'close_app', { app: '微信' }],
    ['关闭这个应用', 'close_app', {}],
    ['关闭所有应用', 'close_all_apps', {}],
    ['回到上一个应用', 'navigate', { action: 'previous_app' }],
    ['打开分屏', 'navigate', { action: 'split_screen' }],
    ['打开快拍', 'open_place', { place: 'reels' }],
    ['打开YouTube的短视频', 'open_place', { place: 'shorts', app: 'YouTube' }],
    ['打开和小王的聊天', 'open_chat', { contact: '小王' }],
    ['设置一个5分钟的计时器', 'set_timer', { seconds: 300 }],
    ['倒计时一个半小时', 'set_timer', { seconds: 5400 }],
    ['设一个早上7点半的闹钟', 'set_alarm', { hour: 7, minute: 30 }],
    ['晚上8点叫醒我', 'set_alarm', { hour: 20, minute: 0 }],
    ['打开手电筒', 'flashlight', { on: true }],
    ['关闭手电筒', 'flashlight', { on: false }],
    ['打开wikipedia.org', 'open_website', { url: 'wikipedia.org' }],
    ['重新打开教程', 'open_tutorial', {}],
  ],
};

describe.each(RULE_LANGUAGES.map((language) => [language] as const))('app requests in %s', (language) => {
  const locale = LOCALES[language];

  it.each(CASES[language])('reads "%s"', (text, tool, args) => {
    const match = parseRequest(text, apps, locale);
    expect(match && { tool: match.tool, args: match.args }).toEqual({ tool, args });
  });

  it('plans every request, or asks which app when two builds are installed', async () => {
    for (const [text] of CASES[language]) {
      const outcome = await planner.plan({ text, locale, foregroundPackage: 'com.whatsapp' });
      expect({ text, ok: outcome.status === 'planned' || outcome.status === 'choose' }).toEqual({ text, ok: true });
    }
  });
});
