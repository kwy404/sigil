import { GENERAL_PROFILE_ID, type ProfileRegistry } from '../app-profiles/registry';
import type { AppProfile } from '../app-profiles/schema';
import { normalizeName } from '../app-profiles/text';

/** An app the launcher lists on the phone. */
export interface InstalledApp {
  label: string;
  packageName: string;
}

/** System apps with no fixed package, opened by their role (the phone's default camera, calculator and so on). */
export const SYSTEM_APPS = [
  'camera',
  'phone',
  'contacts',
  'calculator',
  'calendar',
  'clock',
  'gallery',
  'music',
  'email',
  'maps',
  'files',
  'messages',
  'browser',
] as const;

export type SystemApp = (typeof SYSTEM_APPS)[number];

/** A well known app: its packages, the names people use for it in the eight languages, and its iOS link. */
export interface KnownApp {
  name: string;
  /** Android packages, in order of preference. */
  packages: readonly string[];
  nicknames: readonly string[];
  /** URL scheme that opens it on iOS, where apps open only through their links. */
  iosUrl?: string;
}

export const KNOWN_APPS: readonly KnownApp[] = [
  { name: 'Instagram', packages: ['com.instagram.android'], nicknames: ['insta', 'ig', 'ins', 'instagran', 'インスタ', 'インスタグラム', '照片墙'], iosUrl: 'instagram://' },
  { name: 'Instagram Lite', packages: ['com.instagram.lite'], nicknames: ['insta lite'] },
  {
    name: 'WhatsApp',
    packages: ['com.whatsapp'],
    nicknames: ['zap', 'zapzap', 'zap zap', 'wpp', 'whats', 'whatsap', 'uatizap', 'wasap', 'guasap', 'ワッツアップ'],
    iosUrl: 'whatsapp://',
  },
  { name: 'WhatsApp Business', packages: ['com.whatsapp.w4b'], nicknames: ['zap business', 'whats business'] },
  { name: 'YouTube', packages: ['com.google.android.youtube'], nicknames: ['yt', 'you tube', 'youtub', 'ユーチューブ', '油管'], iosUrl: 'youtube://' },
  { name: 'YouTube Music', packages: ['com.google.android.apps.youtube.music'], nicknames: ['yt music'], iosUrl: 'youtubemusic://' },
  { name: 'Facebook', packages: ['com.facebook.katana'], nicknames: ['face', 'fb', 'feice', 'feicebuque', 'フェイスブック', '脸书'], iosUrl: 'fb://' },
  { name: 'Facebook Lite', packages: ['com.facebook.lite'], nicknames: ['face lite'] },
  { name: 'Messenger', packages: ['com.facebook.orca'], nicknames: ['messenger', 'メッセンジャー'], iosUrl: 'fb-messenger://' },
  { name: 'TikTok', packages: ['com.zhiliaoapp.musically', 'com.ss.android.ugc.trill'], nicknames: ['tik tok', 'tiktok', 'ティックトック'] },
  { name: 'Gmail', packages: ['com.google.android.gm'], nicknames: ['g mail', 'ジーメール'], iosUrl: 'googlegmail://' },
  {
    name: 'Google Maps',
    packages: ['com.google.android.apps.maps'],
    nicknames: ['maps', 'google maps', 'mapas', 'google mapas', 'google karten', 'グーグルマップ', '谷歌地图'],
    iosUrl: 'comgooglemaps://',
  },
  { name: 'Spotify', packages: ['com.spotify.music'], nicknames: ['spoti', 'スポティファイ'], iosUrl: 'spotify://' },
  { name: 'Netflix', packages: ['com.netflix.mediaclient'], nicknames: ['ネトフリ', 'ネットフリックス', '网飞'], iosUrl: 'nflx://' },
  { name: 'Telegram', packages: ['org.telegram.messenger'], nicknames: ['tele', 'テレグラム', '电报'], iosUrl: 'tg://' },
  { name: 'X', packages: ['com.twitter.android'], nicknames: ['twitter', 'ツイッター', '推特'], iosUrl: 'twitter://' },
  { name: 'Google', packages: ['com.google.android.googlequicksearchbox'], nicknames: ['グーグル', '谷歌'], iosUrl: 'google://' },
  {
    name: 'Play Store',
    packages: ['com.android.vending'],
    nicknames: ['playstore', 'google play', 'loja', 'loja de apps', 'tienda', 'プレイストア', '应用商店', '谷歌商店'],
    iosUrl: 'itms-apps://',
  },
  { name: 'Google Drive', packages: ['com.google.android.apps.docs'], nicknames: ['drive'], iosUrl: 'googledrive://' },
  { name: 'Google Photos', packages: ['com.google.android.apps.photos'], nicknames: ['google fotos', 'fotos do google'], iosUrl: 'googlephotos://' },
  { name: 'Uber', packages: ['com.ubercab'], nicknames: [], iosUrl: 'uber://' },
  { name: 'Waze', packages: ['com.waze'], nicknames: [], iosUrl: 'waze://' },
  { name: 'LinkedIn', packages: ['com.linkedin.android'], nicknames: [], iosUrl: 'linkedin://' },
  { name: 'Discord', packages: ['com.discord'], nicknames: [], iosUrl: 'discord://' },
  { name: 'Snapchat', packages: ['com.snapchat.android'], nicknames: ['snap'], iosUrl: 'snapchat://' },
  { name: 'Pinterest', packages: ['com.pinterest'], nicknames: [], iosUrl: 'pinterest://' },
  { name: 'Twitch', packages: ['tv.twitch.android.app'], nicknames: [], iosUrl: 'twitch://' },
  { name: 'Zoom', packages: ['us.zoom.videomeetings'], nicknames: [], iosUrl: 'zoomus://' },
  { name: 'Outlook', packages: ['com.microsoft.office.outlook'], nicknames: [], iosUrl: 'ms-outlook://' },
  { name: 'Teams', packages: ['com.microsoft.teams'], nicknames: ['microsoft teams'], iosUrl: 'msteams://' },
  { name: 'Mercado Livre', packages: ['com.mercadolibre'], nicknames: ['mercado libre'] },
  { name: 'iFood', packages: ['br.com.brainweb.ifood'], nicknames: [] },
  { name: 'Nubank', packages: ['com.nu.production'], nicknames: ['nu'] },
  { name: 'LINE', packages: ['jp.naver.line.android'], nicknames: ['ライン'], iosUrl: 'line://' },
  { name: 'WeChat', packages: ['com.tencent.mm'], nicknames: ['微信'], iosUrl: 'weixin://' },
  { name: '抖音', packages: ['com.ss.android.ugc.aweme'], nicknames: ['douyin'] },
  { name: 'bilibili', packages: ['tv.danmaku.bili'], nicknames: ['b站', '哔哩哔哩'] },
  { name: '支付宝', packages: ['com.eg.android.AlipayGphone'], nicknames: ['alipay'] },
];

/** The words for each system app in the eight languages, and its iOS link when iOS has one. */
export const SYSTEM_APP_WORDS: Record<SystemApp, { words: readonly string[]; iosUrl?: string }> = {
  camera: { words: ['camera', 'câmera', 'cámara', 'caméra', 'appareil photo', 'kamera', 'fotocamera', 'カメラ', '相机', '照相机'] },
  phone: { words: ['phone', 'telefone', 'teléfono', 'téléphone', 'telefon', 'telefono', 'discador', 'dialer', '電話', '电话', '拨号'] },
  contacts: { words: ['contacts', 'contatos', 'contactos', 'kontakte', 'contatti', '連絡先', '联系人', '通讯录'] },
  calculator: { words: ['calculator', 'calculadora', 'calculatrice', 'rechner', 'taschenrechner', 'calcolatrice', '電卓', '计算器'] },
  calendar: {
    words: ['calendar', 'calendário', 'calendario', 'agenda', 'calendrier', 'kalender', 'カレンダー', '日历'],
    iosUrl: 'calshow://',
  },
  clock: { words: ['clock', 'relógio', 'reloj', 'horloge', 'uhr', 'orologio', '時計', '时钟'] },
  gallery: {
    words: ['gallery', 'galeria', 'galería', 'galerie', 'galleria', 'photos', 'fotos', 'foto', 'ギャラリー', '写真', '相册', '图库'],
    iosUrl: 'photos-redirect://',
  },
  music: { words: ['music', 'música', 'musique', 'musik', 'musica', 'ミュージック', '音楽', '音乐'], iosUrl: 'music://' },
  email: { words: ['email', 'e-mail', 'mail', 'correo', 'courriel', 'メール', '邮件', '邮箱'], iosUrl: 'message://' },
  maps: { words: ['map', 'mapa', 'carte', 'karte', 'mappa', '地図', '地图'], iosUrl: 'maps://' },
  files: { words: ['files', 'arquivos', 'archivos', 'fichiers', 'dateien', 'file', 'ファイル', '文件'] },
  messages: {
    words: ['messages', 'mensagens', 'mensajes', 'nachrichten', 'messaggi', 'sms', 'メッセージ', '短信', '信息'],
    iosUrl: 'sms:',
  },
  browser: { words: ['browser', 'navegador', 'navigateur', 'internet', 'ブラウザ', '浏览器'] },
};

/** Builds of the same app; with both installed, Sigil asks which one. */
const VARIANT_SUFFIXES = ['lite', 'go', 'business', 'beta'];

const LEADING_WORDS =
  /^(?:(?:the|my|o|a|os|as|meu|minha|el|la|los|las|mi|le|les|l|mon|ma|il|lo|gli|mio|mia|die|der|das|den|mein|meine)\s+)+/u;
const APP_PREFIX =
  /^(?:app|apps|aplicativo|aplicacao|aplicacion|application|applicazione|appli|anwendung)\s+(?:(?:do|da|de|dos|das|del|di|della|dello|von|vom|du|des|for|of)\s+)?/u;
const APP_SUFFIX = /(?:\s+(?:app|apps|aplicativo|application|appli|anwendung|applicazione)|\s*(?:のアプリ|アプリ|的应用|应用|app))$/u;

/** A spoken app name without articles and words for app: "o app do Banco X" becomes "banco x". */
export function cleanAppName(spoken: string): string {
  let name = normalizeName(spoken);
  for (let pass = 0; pass < 2; pass++) {
    name = name.replace(LEADING_WORDS, '').replace(APP_PREFIX, '').replace(APP_SUFFIX, '').trim();
  }
  return name;
}

/** Where an app request leads. */
export type AppTarget =
  | { kind: 'installed'; label: string; packageName: string }
  | { kind: 'profile'; profile: AppProfile }
  | { kind: 'known'; app: KnownApp }
  | { kind: 'system'; role: SystemApp; spoken: string };

export type AppResolution = { kind: 'one'; target: AppTarget } | { kind: 'several'; options: InstalledApp[] } | { kind: 'none' };

export interface AppCatalog {
  profiles: ProfileRegistry;
  /** Launchable apps of the phone. Empty where Sigil cannot list them (iOS, Expo Go, tests). */
  installed: readonly InstalledApp[];
}

function isVariant(label: string, of: string): boolean {
  const a = normalizeName(label);
  const b = normalizeName(of);
  return a.startsWith(`${b} `) && VARIANT_SUFFIXES.includes(a.slice(b.length + 1));
}

function unique(apps: readonly InstalledApp[]): InstalledApp[] {
  const seen = new Set<string>();
  return apps.filter((app) => {
    const key = `${app.packageName}|${app.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function partialScore(label: string, wanted: string): number {
  if (label.startsWith(`${wanted} `)) return 3;
  if (` ${label} `.includes(` ${wanted} `)) return 2;
  if (wanted.length >= 3 && label.startsWith(wanted)) return 1;
  return 0;
}

/**
 * Finds the app a spoken name means. Installed apps come first: a label that
 * matches exactly, or the packages of a known nickname ("zap", "insta",
 * "yt") or of an app profile. When builds of the same app are installed
 * (Instagram and Instagram Lite, WhatsApp and WhatsApp Business), or several
 * labels match equally well ("banco" for two banks), the answer is several
 * options to ask about. Without a match on the phone, the profile catalog,
 * the system apps (camera, calculator...) and the known apps follow, so iOS
 * can still open apps through their links. Accents and case do not matter.
 */
export function resolveApp(spoken: string, catalog: AppCatalog): AppResolution {
  const raw = spoken.trim();
  const byPackageName = catalog.installed.find((app) => app.packageName === raw);
  if (byPackageName) {
    return { kind: 'one', target: { kind: 'installed', ...byPackageName } };
  }
  const wanted = cleanAppName(raw);
  if (!wanted) {
    return { kind: 'none' };
  }
  const known = KNOWN_APPS.filter((app) => [app.name, ...app.nicknames].some((name) => normalizeName(name) === wanted));
  const profile = catalog.profiles.findApp(wanted);
  const packages = new Set([...known.flatMap((app) => app.packages), ...(known.length === 0 ? (profile?.packages ?? []) : [])]);

  const exact = catalog.installed.filter((app) => normalizeName(app.label) === wanted);
  const matched = unique([...exact, ...catalog.installed.filter((app) => packages.has(app.packageName))]);
  if (matched.length > 0) {
    const variants = catalog.installed.filter(
      (app) => !matched.includes(app) && matched.some((top) => isVariant(app.label, top.label)),
    );
    const options = unique([...matched, ...variants]);
    return options.length === 1
      ? { kind: 'one', target: { kind: 'installed', ...options[0] } }
      : { kind: 'several', options };
  }

  // A profile whose app is not on the phone gives way to the phone's own app
  // of that kind ("mensagens" on a phone with another messaging app).
  if (profile && known.length === 0 && catalog.installed.length === 0) {
    return { kind: 'one', target: { kind: 'profile', profile } };
  }
  for (const role of Object.keys(SYSTEM_APP_WORDS) as SystemApp[]) {
    if (SYSTEM_APP_WORDS[role].words.some((word) => normalizeName(word) === wanted)) {
      return { kind: 'one', target: { kind: 'system', role, spoken: raw } };
    }
  }
  if (profile && known.length === 0) {
    return { kind: 'one', target: { kind: 'profile', profile } };
  }
  if (known.length > 0) {
    return { kind: 'one', target: { kind: 'known', app: known[0] } };
  }

  const scored = catalog.installed
    .map((app) => ({ app, score: partialScore(normalizeName(app.label), wanted) }))
    .filter((entry) => entry.score > 0);
  if (scored.length > 0) {
    const best = Math.max(...scored.map((entry) => entry.score));
    const top = unique(scored.filter((entry) => entry.score === best).map((entry) => entry.app));
    return top.length === 1 ? { kind: 'one', target: { kind: 'installed', ...top[0] } } : { kind: 'several', options: top };
  }
  return { kind: 'none' };
}

/** The display name and Android packages of a target, for messages and for the checks of close requests. */
export function targetInfo(target: AppTarget): { name: string; packages: string[] } {
  switch (target.kind) {
    case 'installed':
      return { name: target.label, packages: [target.packageName] };
    case 'profile':
      return { name: target.profile.name, packages: [...target.profile.packages] };
    case 'known':
      return { name: target.app.name, packages: [...target.app.packages] };
    case 'system':
      return { name: target.spoken, packages: [] };
  }
}

/**
 * The app profile a spoken name means: a profile name or alias, or a known
 * app's nickname whose package has a profile ("zap" is the WhatsApp profile).
 */
export function findProfile(spoken: string, profiles: ProfileRegistry): AppProfile | undefined {
  const direct = profiles.findApp(spoken);
  if (direct) {
    return direct;
  }
  const wanted = cleanAppName(spoken);
  const known = KNOWN_APPS.find((app) => [app.name, ...app.nicknames].some((name) => normalizeName(name) === wanted));
  for (const pkg of known?.packages ?? []) {
    const profile = profiles.forPackage(pkg);
    if (profile.id !== GENERAL_PROFILE_ID) {
      return profile;
    }
  }
  return wanted ? profiles.findApp(wanted) : undefined;
}

/** Ordinal words of the eight languages, by position: "the first", "o segundo", "二つ目", "第三个". */
const ORDINALS: readonly (readonly string[])[] = [
  ['1', 'first', 'primeiro', 'primeira', 'primero', 'primera', 'premier', 'premiere', 'erste', 'erster', 'erstes', 'ersten', 'primo', 'prima', '最初', '一つ目', '1つ目', '一番目', '第一个', '第一'],
  ['2', 'second', 'segundo', 'segunda', 'deuxieme', 'seconde', 'zweite', 'zweiter', 'zweites', 'zweiten', 'secondo', 'seconda', '二つ目', '2つ目', '二番目', '第二个', '第二'],
  ['3', 'third', 'terceiro', 'terceira', 'tercero', 'tercera', 'troisieme', 'dritte', 'dritter', 'drittes', 'dritten', 'terzo', 'terza', '三つ目', '3つ目', '三番目', '第三个', '第三'],
  ['4', 'fourth', 'quarto', 'quarta', 'cuarto', 'cuarta', 'quatrieme', 'vierte', 'vierter', 'viertes', 'vierten', '四つ目', '4つ目', '四番目', '第四个', '第四'],
];
const LAST = ['last', 'ultimo', 'ultima', 'dernier', 'derniere', 'letzte', 'letzter', 'letztes', 'letzten', '最後', '最后一个', '最后'];

/**
 * The option an answer picks, by name ("o Lite", "Instagram Lite"), by a word
 * only one option has, or by position ("the second one", "二つ目"). Null when
 * the answer picks none or several.
 */
export function pickApp<T extends { label: string }>(answer: string, options: readonly T[]): T | null {
  const said = normalizeName(answer);
  const wanted = cleanAppName(answer);
  if (!said || options.length === 0) {
    return null;
  }
  const labels = options.map((option) => normalizeName(option.label));
  const exact = labels.indexOf(wanted);
  if (exact >= 0) {
    return options[exact];
  }
  const named = labels
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => ` ${said} `.includes(` ${label} `))
    .sort((a, b) => b.label.length - a.label.length);
  if (named.length > 0 && (named.length === 1 || named[0].label.length > named[1].label.length)) {
    return options[named[0].index];
  }
  // Words no option has ("the lite one", "o normal") say nothing about which option is meant.
  const has = (label: string, word: string) => ` ${label} `.includes(` ${word} `);
  const words = wanted.split(' ').filter((word) => word && labels.some((label) => has(label, word)));
  const containing = labels.flatMap((label, index) =>
    words.length > 0 && words.every((word) => has(label, word)) ? [index] : [],
  );
  if (containing.length === 1) {
    return options[containing[0]];
  }
  const tokens = said.split(' ');
  const says = (word: string) => tokens.includes(word) || (/[^a-z0-9 ]/u.test(word) && said.includes(word));
  for (let index = 0; index < Math.min(ORDINALS.length, options.length); index++) {
    if (ORDINALS[index].some(says)) {
      return options[index];
    }
  }
  return LAST.some(says) ? options[options.length - 1] : null;
}

/** Names the rule parser and the language model may hear: installed labels, profiles, known apps and their nicknames. */
export function appNamesFor(catalog: AppCatalog): string[] {
  const names = new Set<string>();
  for (const app of catalog.installed) names.add(app.label);
  for (const profile of catalog.profiles.list()) {
    if (profile.packages.length === 0) continue;
    names.add(profile.name);
    names.add(profile.id);
    for (const alias of profile.aliases ?? []) names.add(alias);
  }
  for (const app of KNOWN_APPS) {
    names.add(app.name);
    for (const nickname of app.nicknames) names.add(nickname);
  }
  return [...names].filter((name) => name.trim().length > 0);
}
