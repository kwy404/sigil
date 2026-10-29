import type { AppPlace } from '../../app-profiles/schema';
import {
  CJK_NUM,
  clockTime,
  compactTime,
  type DayPeriod,
  durationSeconds,
  type DurationUnits,
  fixed,
  hourBefore,
  lookup,
  parseCjkNumber,
  percent,
  placeArgs,
  speedRate,
  toSeconds,
  unquote,
  withApp,
} from './helpers';
import type { Groups, LanguagePack, RuleArgs } from './types';

/** Japanese verbs for sending, in the forms people use with a phone: 送って, 送信して, 伝えて. */
const SEND_VERB = '(?:メッセージ(?:を)?)?(?:送って|送る|送信して|伝えて|言って|メッセージして)';

function sendArgs(g: Groups): RuleArgs | null {
  const contact = unquote(g.contact ?? '');
  const text = unquote(g.text ?? '');
  if (!contact || !text) return null;
  return withApp(g, { contact, text });
}

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^(?:上|アップ)$/u, 'up'],
  [/^(?:下|ダウン)$/u, 'down'],
  [/^左$/u, 'left'],
  [/^右$/u, 'right'],
];

const STREAMS: [RegExp, 'ring' | 'alarm'][] = [
  [/^(?:着信音|着信|マナーモード)$/u, 'ring'],
  [/^アラーム$/u, 'alarm'],
];

function stream(g: Groups): { stream?: 'ring' | 'alarm' } {
  if (!g.stream) return {};
  const value = lookup<'media' | 'ring' | 'alarm'>(g.stream, STREAMS, 'media');
  return value === 'media' ? {} : { stream: value };
}

function levelArgs(tool: 'volume' | 'brightness', g: Groups): RuleArgs | null {
  const level = g.extreme ? (g.extreme === '最大' ? 100 : 0) : percent(parseCjkNumber(g.level));
  if (level === null) return null;
  return { action: 'set', level, ...(tool === 'volume' ? stream(g) : {}) };
}

function seek(direction: 'forward' | 'back') {
  return (g: Groups): RuleArgs | null => {
    const seconds = toSeconds(parseCjkNumber(g.n), g.unit, /^分$/u);
    return seconds === null ? null : { direction, seconds };
  };
}

function rate(g: Groups): RuleArgs | null {
  const value = speedRate(parseCjkNumber(g.rate));
  return value === null ? null : { rate: value };
}

const UP = /^(?:上げて|上げる|大きくして|大きく|アップ|明るくして)$/u;

const PLACES: [RegExp, AppPlace][] = [
  [/^(?:リール|reels?)$/iu, 'reels'],
  [/^(?:ショート|shorts?)$/iu, 'shorts'],
  [/^(?:登録チャンネル|チャンネル登録)$/u, 'subscriptions'],
  [/^(?:dm|ダイレクトメッセージ|ダイレクト|メッセージ|受信箱)$/iu, 'messages'],
  [/^(?:プロフィール|マイページ)$/u, 'profile'],
  [/^(?:発見|探索)$/u, 'explore'],
];
/** Words that only name a place with an app: 「メッセージを開いて」 opens the messaging app. */
const GENERIC_PLACE = /^(?:メッセージ|受信箱)$/u;
const SPAN_UNITS: DurationUnits = { hour: /^時間$/u, minute: /^分(?:間)?$/u, second: /^秒(?:間)?$/u };

function timerArgs(g: Groups): RuleArgs | null {
  const seconds = durationSeconds(
    [
      [parseCjkNumber(g.n1), g.u1],
      [parseCjkNumber(g.n2), g.u2],
    ],
    SPAN_UNITS,
    Boolean(g.half),
  );
  return seconds === null ? null : { seconds };
}

function alarmArgs(g: Groups): RuleArgs | null {
  const period: DayPeriod = !g.period ? null : /^(?:午前|朝)$/u.test(g.period) ? 'am' : g.period === '夜' ? 'night' : 'pm';
  if (g.noon) return clockTime(g.noon === '正午' ? 12 : 0);
  if (g.hm) {
    const time = compactTime(g.hm.replace('：', ':'));
    return time ? clockTime(time[0], time[1], period) : null;
  }
  return clockTime(parseCjkNumber(g.h), g.half ? 30 : g.m === undefined ? 0 : parseCjkNumber(g.m), period);
}

export const ja: LanguagePack = {
  id: 'ja',
  code: 'ja',
  vocab: {
    SPAN: '(?:(?<n1>NUM)(?<u1>時間|分間?|秒間?)(?:(?<n2>NUM)(?<u2>分間?|秒間?))?(?<half>半)?)',
    CLOCK: '(?:(?<period>午前|午後|朝|夜|夕方|昼)の?)?(?:(?<hm>\\d{1,2}[:：]\\d{2})|(?<h>NUM)時(?:(?<m>NUM)分|(?<half>半))?|(?<noon>正午|真夜中))',
    DOMAIN: '[a-z0-9-]+(?:(?:\\.|点|ドット)[a-z0-9-]+)*(?:\\.|点|ドット)[a-z]{2,}(?:/[^ ]*)?',
    NUM: CJK_NUM,
    PCT: '(?:%|パーセント)',
  },
  rules: [
    {
      id: 'place',
      tool: 'open_place',
      source:
        '^(?:(?<app>APPS)の)?(?<place>リール|reels?|ショート|shorts?|登録チャンネル|dm|ダイレクトメッセージ|メッセージ|受信箱|プロフィール|マイページ|発見)(?:を)?(?:開いて|開く|見せて|表示して)$',
      build: (g) => placeArgs(g, lookup<AppPlace | ''>(g.place, PLACES, ''), GENERIC_PLACE),
    },
    {
      id: 'send-quoted',
      tool: 'send_message',
      source: `^(?:(?<app1>APPS)で)?(?<contact>[^「」]+?)(?:に|へ)(?:(?<app2>APPS)で)?「(?<text>[^」]+)」(?:と|って)${SEND_VERB}$`,
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: `^(?:(?<app1>APPS)で)?(?<contact>[^、「」 ]+?)(?:に|へ)(?:(?<app2>APPS)で)?メッセージ(?:を)?(?:送って|送る|送信して|して)$`,
      build: (g) => ({ question: ja.askMessageText(unquote(g.contact ?? '')) }),
    },
    {
      id: 'send-plain',
      tool: 'send_message',
      source: `^(?:(?<app1>APPS)で)?(?<contact>[^、「」 ]+?)(?:に|へ)(?:(?<app2>APPS)で)?(?<text>.+?)(?:と|って)${SEND_VERB}$`,
      build: sendArgs,
    },
    {
      id: 'play-on-app',
      tool: 'search',
      source: [
        '^(?<app>APPS)で(?<query>.+?)(?:を)?(?:再生して|再生|流して|かけて|見せて)$',
        '^(?<query>.+?)(?:を)?(?<app>APPS)で(?:再生して|再生|流して|かけて)$',
      ],
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: [
        '^(?<app>APPS)で(?<query>.+?)(?:を)?(?:検索して|検索|調べて|探して)$',
        '^(?<query>.+?)(?:を)?(?<app>APPS)で(?:検索して|検索|調べて|探して)$',
        '^(?<query>.+?)(?:を)?(?:検索して|検索|調べて|ググって)$',
      ],
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source: [
        '^(?:(?<stream>着信音|着信|アラーム|メディア)の)?(?:音量|ボリューム)(?:を)?(?<level>NUM)PCT?(?:に(?:して|する|設定して)?)?$',
        '^(?:(?<stream>着信音|着信|アラーム|メディア)の)?(?:音量|ボリューム)(?:を)?(?<extreme>最大|最小)(?:に(?:して|する)?)?$',
      ],
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        '^(?:(?<stream>着信音|着信|アラーム|メディア)の)?(?:音量|ボリューム)(?:を)?(?<dir>上げて|上げる|大きくして|下げて|下げる|小さくして|アップ|ダウン)$',
        '^(?:音|声)(?:を)?(?<dir>大きくして|大きく|小さくして|小さく)$',
      ],
      build: (g) => ({ action: UP.test(g.dir ?? '') ? 'up' : 'down', ...stream(g) }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: [
        '^(?:ミュート|消音)(?:にして|して)?$',
        '^音(?:を)?消して$',
        '^(?<stream>マナーモード)(?:にして)?$',
      ],
      build: (g) => ({ action: 'mute', ...stream(g) }),
    },
    {
      id: 'unmute',
      tool: 'volume',
      source: '^(?:(?:ミュート|消音)(?:を)?解除(?:して)?|音を出して|音を戻して)$',
      build: fixed({ action: 'unmute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source: [
        '^(?:画面の)?明るさ(?:を)?(?<level>NUM)PCT?(?:に(?:して|する)?)?$',
        '^(?:画面の)?明るさ(?:を)?(?<extreme>最大|最小)(?:に(?:して|する)?)?$',
      ],
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        '^(?:画面の)?明るさ(?:を)?(?<dir>上げて|上げる|下げて|下げる|アップ|ダウン)$',
        '^(?:画面(?:を)?)?(?<dir>明るくして|暗くして)$',
      ],
      build: (g) => ({ action: UP.test(g.dir ?? '') ? 'up' : 'down' }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source: '^(?<n>NUM)(?<unit>秒|分)(?:間)?(?:先に)?(?:進めて|進む|早送りして|早送り|スキップして|スキップ|飛ばして)$',
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: '^(?<n>NUM)(?<unit>秒|分)(?:間)?(?:前に)?(?:戻して|戻る|戻って|巻き戻して|巻き戻し)$',
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        '^(?:再生)?速度(?:を)?(?<rate>NUM)倍(?:速)?(?:に(?:して)?)?$',
        '^(?<rate>NUM)倍速(?:で再生(?:して)?|に(?:して)?)?$',
      ],
      build: rate,
    },
    {
      id: 'speed-normal',
      tool: 'playback_speed',
      source: '^(?:等速|通常(?:の)?速度|普通(?:の)?速度)(?:に(?:して|戻して)?|で再生(?:して)?)?$',
      build: fixed({ rate: 1 }),
    },
    {
      id: 'speed-double',
      tool: 'playback_speed',
      source: '^倍速(?:で再生(?:して)?|に(?:して)?)?$',
      build: fixed({ rate: 2 }),
    },
    {
      id: 'like',
      tool: 'like',
      source: '^(?:(?<app>APPS)で)?(?:この(?:動画|投稿|写真|リール)に)?(?:いいね|高く評価)(?:を押して|して|する|を付けて|を押す)?$',
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?:コントロール)?スフィア(?:を)?(?<verb>開いて|開く|表示して|出して|閉じて|閉じる|隠して)?$',
      build: (g) => ({ action: /^(?:閉じ|隠し)/u.test(g.verb ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:wi-?fi|ワイファイ|無線lan)(?:の設定)?(?:を)?(?:オンにして|オフにして|つけて|切って|開いて|オン|オフ)?$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:bluetooth|ブルートゥース)(?:の設定)?(?:を)?(?:オンにして|オフにして|つけて|切って|開いて|オン|オフ)?$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source: '^(?:サイレントモード|おやすみモード|サイレント)(?:を)?(?:オンにして|オフにして|にして|開いて|オン|オフ)?$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    {
      id: 'close-all',
      tool: 'close_all_apps',
      source: [
        '^(?:すべて|全て|全部)の(?:アプリ|アプリケーション)(?:を)?(?:閉じて|閉じる|終了して|終了)$',
        '^(?:アプリ|アプリケーション)(?:を)?(?:すべて|全て|全部)(?:閉じて|閉じる|終了して)$',
        '^(?:最近(?:使った)?(?:の)?アプリ|アプリ履歴|履歴)(?:を)?(?:すべて|全て|全部)?(?:消して|削除して|クリアして)$',
      ],
      build: fixed({}),
    },
    {
      id: 'close-this',
      tool: 'close_app',
      source: ['^(?:この|今の|現在の)?(?:アプリ|アプリケーション)(?:を)?(?:閉じて|閉じる|終了して|終了)$', '^(?:これ|それ)(?:を)?(?:閉じて|閉じる)$'],
      build: fixed({}),
    },
    {
      id: 'previous-app',
      tool: 'navigate',
      source: ['^(?:前の|直前の|さっきの)アプリ(?:に|へ)?(?:戻って|戻る|切り替えて)?$', '^アプリ(?:を)?切り替えて$'],
      build: fixed({ action: 'previous_app' }),
    },
    {
      id: 'split-screen',
      tool: 'navigate',
      source: '^(?:画面分割|分割画面|画面を分割)(?:して|する|にして|を開いて)?$',
      build: fixed({ action: 'split_screen' }),
    },
    {
      id: 'tutorial',
      tool: 'open_tutorial',
      source: [
        '^(?:もう一度|もう一回|また)?(?:チュートリアル|使い方ガイド)(?:を)?(?:もう一度|もう一回)?(?:開いて|見せて|表示して|始めて|やり直して|やって|再生して)?$',
        '^(?:sigilの)?使い方(?:を)?(?:教えて|見せて)$',
      ],
      build: fixed({}),
    },
    {
      id: 'timer',
      tool: 'set_timer',
      source: [
        '^(?:タイマー(?:を)?)?SPAN(?:の)?(?:タイマー)?(?:を)?(?:セットして|セット|かけて|設定して|始めて|スタートして|測って|計って)$',
        '^SPANのタイマー$',
        '^タイマー(?:を)?SPAN(?:に|で)?(?:セットして|設定して|かけて)?$',
        '^SPAN後に(?:教えて|知らせて|呼んで)$',
      ],
      build: timerArgs,
    },
    {
      id: 'alarm',
      tool: 'set_alarm',
      source: [
        '^CLOCKに(?:アラーム|目覚まし)(?:を)?(?:セットして|かけて|設定して|鳴らして)?$',
        '^(?:アラーム|目覚まし)(?:を)?CLOCKに(?:セットして|かけて|設定して)?$',
        '^CLOCKに起こして$',
      ],
      build: alarmArgs,
    },
    {
      id: 'flashlight',
      tool: 'flashlight',
      source: '^(?:ライト|懐中電灯|フラッシュライト)(?:を)?(?<state>つけて|付けて|点けて|オンにして|オン|消して|けして|オフにして|オフ)$',
      build: (g) => ({ on: !/^(?:消して|けして|オフ)/u.test(g.state ?? '') }),
    },
    {
      id: 'website',
      tool: 'open_website',
      source: '^(?<url>DOMAIN)(?:を)?(?:開いて|開く|表示して)$',
      build: (g) => ({ url: unquote(g.url ?? '') }),
    },
    {
      id: 'open-chat',
      tool: 'open_chat',
      source: '^(?:(?<app>APPS)で)?(?<contact>[^、 ]+?)(?:さん)?(?:と|との)(?:チャット|トーク|会話)(?:を)?(?:開いて|開く|見せて)$',
      build: (g) => withApp(g, { contact: unquote(g.contact ?? '') }),
    },
    {
      id: 'close-app',
      tool: 'close_app',
      source: '^(?<app>.+?)(?:を)?(?:閉じて|閉じる|終了して|終了|やめて)$',
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    { id: 'back', tool: 'navigate', source: '^(?:戻って|戻る|前の画面に戻って|前の画面に戻る|バック)$', build: fixed({ action: 'back' }) },
    {
      id: 'home',
      tool: 'navigate',
      source: '^ホーム(?:画面)?(?:に戻って|に戻る|へ戻って|に|へ)?$',
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:最近(?:使った)?(?:の)?アプリ|アプリ履歴|履歴)(?:を)?(?:開いて|表示して|見せて)?$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^通知(?:を)?(?:開いて|表示して|見せて|確認して)?$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^クイック設定(?:を)?(?:開いて|表示して)?$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: '^(?:画面(?:を)?)?ロック(?:して|する)?$',
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: '^(?:スクショ|スクリーンショット|画面キャプチャ)(?:を)?(?:撮って|撮る|して)?$',
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: '^電源(?:メニュー|オプション)(?:を)?(?:開いて|表示して|出して)?$',
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:一時停止|ポーズ|止めて|ストップ|停止)(?:して)?$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:再生|再開)(?:して)?$|^続けて$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:次の(?:曲|動画|トラック)|次へ|次|スキップ)(?:に(?:して)?|して)?$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:前の(?:曲|動画|トラック)|前へ)(?:に(?:して)?|戻して)?$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: '^(?<app>.+?)(?:を)?(?:開いて|開く|開けて|起動して|起動|立ち上げて)$',
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: [
        '^(?:(?<direction>上|下|左|右)(?:に|へ|方向に)?)?(?:スクロール|スワイプ)(?:して|する)?$',
        '^スクロール(?<direction>アップ|ダウン)$',
      ],
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
  ],
  prefixes: [/^(?:(?:ねえ|ねぇ|ヘイ|オーケー|ok)\s*)?(?:シジル|sigil)[\s、,:!！。]*/iu, /^(?:すみません|ちょっと)[、,\s]*/u],
  suffixes: [/(?:ください|下さい|お願いします|お願い|ちょうだい)$/u],
  yes: ['はい', 'うん', 'ええ', 'お願い', 'お願いします', '送って', '送信', '送信して', '投稿して', '確認', 'オーケー', 'ok', 'いいよ', 'どうぞ'],
  no: ['いいえ', 'いや', 'ううん', 'やめて', 'キャンセル', '中止', '待って', '送らないで', 'だめ', 'ダメ'],
  sensitive: [
    '送信',
    '送る',
    '投稿',
    '公開',
    '共有',
    'シェア',
    '電話',
    '発信',
    '削除',
    '消去',
    '支払',
    '払う',
    '購入',
    '買う',
    '注文',
    '登録',
    '送金',
    '振込',
    '確定',
    '確認',
    'アンインストール',
  ],
  bulk: [
    /全員|みんなに|皆に|(?:全て|すべて|全部)の(?:連絡先|友達|友だち|フォロワー|グループ|投稿|写真|動画|コメント|メッセージ)/u,
    /(?:[2-9]|[1-9][0-9]+|[二三四五六七八九十百][〇一二三四五六七八九十百]*)回/u,
    /毎(?:秒|分|時間|日|朝|晩|週)/u,
    /一斉|大量/u,
  ],
  severalPeople: [/[、，,]/u, /(.{2,})と(?!(?:さん|くん|ちゃん|さま|様|先生)$)(.{2,})/u],
  askMessageText: (contact) => `${contact}へのメッセージは何と送りますか？`,
};
