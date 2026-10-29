import { CJK_NUM, fixed, lookup, parseCjkNumber, percent, speedRate, toSeconds, unquote, withApp } from './helpers';
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

export const ja: LanguagePack = {
  id: 'ja',
  code: 'ja',
  vocab: {
    NUM: CJK_NUM,
    PCT: '(?:%|パーセント)',
  },
  rules: [
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
