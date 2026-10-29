import { CJK_NUM, fixed, lookup, parseCjkNumber, percent, speedRate, toSeconds, unquote, withApp } from './helpers';
import type { Groups, LanguagePack, RuleArgs } from './types';

const MESSAGE = '(?:一条|个)?(?:消息|信息|短信)';
const VIA = '(?:用|通过|在)';

function sendArgs(g: Groups): RuleArgs | null {
  const contact = unquote(g.contact ?? '');
  const text = unquote(g.text ?? '');
  if (!contact || !text) return null;
  return withApp(g, { contact, text });
}

const DIRECTIONS: [RegExp, 'up' | 'down' | 'left' | 'right'][] = [
  [/^上$/u, 'up'],
  [/^下$/u, 'down'],
  [/^左$/u, 'left'],
  [/^右$/u, 'right'],
];

const STREAMS: [RegExp, 'ring' | 'alarm'][] = [
  [/^(?:铃声|来电)$/u, 'ring'],
  [/^闹钟$/u, 'alarm'],
];

function stream(g: Groups): { stream?: 'ring' | 'alarm' } {
  if (!g.stream) return {};
  const value = lookup<'media' | 'ring' | 'alarm'>(g.stream, STREAMS, 'media');
  return value === 'media' ? {} : { stream: value };
}

function levelArgs(tool: 'volume' | 'brightness', g: Groups): RuleArgs | null {
  const level = g.extreme ? (/^最(?:大|高)$/u.test(g.extreme) ? 100 : 0) : percent(parseCjkNumber(g.level ?? g.level2));
  if (level === null) return null;
  return { action: 'set', level, ...(tool === 'volume' ? stream(g) : {}) };
}

function seek(direction: 'forward' | 'back') {
  return (g: Groups): RuleArgs | null => {
    const seconds = toSeconds(parseCjkNumber(g.n), g.unit, /^分/u);
    return seconds === null ? null : { direction, seconds };
  };
}

function rate(g: Groups): RuleArgs | null {
  const value = speedRate(parseCjkNumber(g.rate));
  return value === null ? null : { rate: value };
}

const UP = /^(?:调高|调大|调亮|加大|增大|提高|大一点|大点|高一点|亮一点|大声)$/u;

export const zh: LanguagePack = {
  id: 'zh',
  code: 'zh',
  vocab: {
    NUM: CJK_NUM,
    PCT: '(?:%)',
  },
  rules: [
    {
      id: 'send-app-first',
      tool: 'send_message',
      source: `^${VIA}(?<app1>APPS)(?:上)?(?:给|跟|向)(?<contact>.+?)发${MESSAGE}?(?:说|，|,|：|:)\\s*(?<text>.+)$`,
      build: sendArgs,
    },
    {
      id: 'send',
      tool: 'send_message',
      source: [
        `^(?:给|跟|向)(?<contact>.+?)(?:${VIA}(?<app2>APPS)(?:上)?)?发${MESSAGE}(?:说|，|,|：|:)\\s*(?<text>.+)$`,
        `^发${MESSAGE}给(?<contact>.+?)(?:说|，|,|：|:)\\s*(?<text>.+)$`,
      ],
      build: sendArgs,
    },
    {
      id: 'tell',
      tool: 'send_message',
      source: [
        '^(?:告诉|跟|和|对)(?<contact>.+?)说\\s*(?<text>.+)$',
        '^告诉(?<contact>.+?)[，,：:]\\s*(?<text>.+)$',
        '^告诉(?<contact>[^我你他她它]+?)(?<text>我.+)$',
      ],
      build: sendArgs,
    },
    {
      id: 'send-no-text',
      tool: 'clarify',
      source: [
        `^(?:给|跟|向)(?<contact>.+?)(?:${VIA}(?<app2>APPS)(?:上)?)?发${MESSAGE}$`,
        `^${VIA}(?<app1>APPS)(?:上)?(?:给|跟|向)(?<contact>.+?)发${MESSAGE}$`,
      ],
      build: (g) => ({ question: zh.askMessageText(unquote(g.contact ?? '')) }),
    },
    {
      id: 'play-on-app',
      tool: 'search',
      source: '^(?:在|用)(?<app>APPS)(?:上|里)?(?:播放|放|看)(?<query>.+)$',
      build: (g) => ({ app: (g.app ?? '').trim(), query: unquote(g.query ?? '') }),
    },
    {
      id: 'search',
      tool: 'search',
      source: ['^(?:在|用)(?<app>APPS)(?:上|里)?(?:搜索|搜|查找|找)(?<query>.+)$', '^(?:搜索|搜一下|搜|查找|查一下)(?<query>.+)$'],
      build: (g) => withApp(g, { query: unquote(g.query ?? '') }),
    },
    {
      id: 'volume-set',
      tool: 'volume',
      source: [
        '^(?:把)?(?:(?<stream>铃声|来电|闹钟|媒体)(?:的)?)?音量(?:调到|调成|设为|设置为|设成|开到|到)?(?:百分之(?<level>NUM)|(?<level2>NUM)PCT?)$',
        '^(?:把)?(?:(?<stream>铃声|来电|闹钟|媒体)(?:的)?)?音量(?:调到|开到|调成)?(?<extreme>最大|最小|最高|最低)$',
      ],
      build: (g) => levelArgs('volume', g),
    },
    {
      id: 'volume-change',
      tool: 'volume',
      source: [
        '^(?:把)?(?:(?<stream>铃声|来电|闹钟|媒体)(?:的)?)?(?:音量|声音)(?<dir>调高|调大|调低|调小|加大|增大|减小|降低|大一点|小一点|大点|小点)(?:一点|一些)?$',
        '^(?<dir>调高|调大|调低|调小|增大|减小|提高|降低)(?:(?<stream>铃声|来电|闹钟|媒体)(?:的)?)?(?:音量|声音)$',
        '^(?<dir>大声|小声)(?:一)?点(?:儿)?$',
      ],
      build: (g) => ({ action: UP.test(g.dir ?? '') ? 'up' : 'down', ...stream(g) }),
    },
    {
      id: 'mute',
      tool: 'volume',
      source: '^(?:开启|打开|设为)?静音$',
      build: fixed({ action: 'mute' }),
    },
    {
      id: 'unmute',
      tool: 'volume',
      source: '^(?:取消静音|关闭静音|解除静音|打开声音|开启声音)$',
      build: fixed({ action: 'unmute' }),
    },
    {
      id: 'brightness-set',
      tool: 'brightness',
      source: [
        '^(?:把)?(?:屏幕)?亮度(?:调到|调成|设为|设置为|到)?(?:百分之(?<level>NUM)|(?<level2>NUM)PCT?)$',
        '^(?:把)?(?:屏幕)?亮度(?:调到|调成)?(?<extreme>最大|最小|最高|最低)$',
      ],
      build: (g) => levelArgs('brightness', g),
    },
    {
      id: 'brightness-change',
      tool: 'brightness',
      source: [
        '^(?:把)?(?:屏幕)?亮度(?<dir>调高|调大|调亮|调低|调暗|调小|提高|降低|高一点|低一点)(?:一点|一些)?$',
        '^(?<dir>调高|调低|提高|降低|调亮|调暗)(?:屏幕)?亮度$',
        '^(?:把)?(?:屏幕)?(?<dir>调亮|调暗|亮一点|暗一点)(?:一点)?$',
        '^(?:把)?(?<dir>调亮|调暗)屏幕$',
      ],
      build: (g) => ({ action: UP.test(g.dir ?? '') ? 'up' : 'down' }),
    },
    {
      id: 'seek-forward',
      tool: 'seek',
      source: '^(?:快进|前进|往前|向前)(?:跳)?(?<n>NUM)(?<unit>秒|分钟|分)(?:钟)?$',
      build: seek('forward'),
    },
    {
      id: 'seek-back',
      tool: 'seek',
      source: '^(?:后退|倒退|快退|往回退|往后退|回退|倒回)(?<n>NUM)(?<unit>秒|分钟|分)(?:钟)?$',
      build: seek('back'),
    },
    {
      id: 'speed',
      tool: 'playback_speed',
      source: [
        '^(?:播放)?速度(?:调到|调成|设为|改成)?(?<rate>NUM)倍(?:速)?$',
        '^(?:以|用|调成|改成)?(?<rate>NUM)倍速(?:播放)?$',
      ],
      build: rate,
    },
    {
      id: 'speed-normal',
      tool: 'playback_speed',
      source: '^(?:正常速度|原速|正常倍速)(?:播放)?$',
      build: fixed({ rate: 1 }),
    },
    {
      id: 'speed-double',
      tool: 'playback_speed',
      source: '^倍速播放$',
      build: fixed({ rate: 2 }),
    },
    {
      id: 'like',
      tool: 'like',
      source: [
        '^(?:在(?<app>APPS)上)?(?:给(?:这个|这条)?(?:视频|帖子|照片|动态)?)?点(?:个)?赞$',
        '^赞(?:一下)?$',
      ],
      build: (g) => withApp(g, {}),
    },
    {
      id: 'sphere',
      tool: 'control_sphere',
      source: '^(?<verb>打开|开启|显示|关闭|隐藏)?控制球(?:体)?$',
      build: (g) => ({ action: /^(?:关闭|隐藏)$/u.test(g.verb ?? '') ? 'close' : 'open' }),
    },
    {
      id: 'panel-wifi',
      tool: 'settings_panel',
      source: '^(?:打开|开启|关闭|连接)?(?:wi-?fi|无线网(?:络)?|无线局域网)(?:设置)?$',
      build: fixed({ panel: 'wifi' }),
    },
    {
      id: 'panel-bluetooth',
      tool: 'settings_panel',
      source: '^(?:打开|开启|关闭)?蓝牙(?:设置)?$',
      build: fixed({ panel: 'bluetooth' }),
    },
    {
      id: 'panel-dnd',
      tool: 'settings_panel',
      source: '^(?:打开|开启|关闭)?(?:勿扰模式|免打扰(?:模式)?|勿扰)$',
      build: fixed({ panel: 'do_not_disturb' }),
    },
    { id: 'back', tool: 'navigate', source: '^(?:返回|后退|回到上一页|返回上一页|上一页)$', build: fixed({ action: 'back' }) },
    {
      id: 'home',
      tool: 'navigate',
      source: '^(?:回到|返回|去|回)?(?:主屏幕|桌面|主页|主界面)$',
      build: fixed({ action: 'home' }),
    },
    {
      id: 'recents',
      tool: 'navigate',
      source: '^(?:打开|显示)?(?:最近(?:的)?(?:应用|任务)|多任务(?:界面)?)$',
      build: fixed({ action: 'recents' }),
    },
    {
      id: 'notifications',
      tool: 'navigate',
      source: '^(?:打开|查看|显示|下拉)?通知(?:栏|中心)?$',
      build: fixed({ action: 'notifications' }),
    },
    {
      id: 'quick-settings',
      tool: 'navigate',
      source: '^(?:打开)?(?:快捷设置|快速设置|控制中心)$',
      build: fixed({ action: 'quick_settings' }),
    },
    {
      id: 'lock',
      tool: 'navigate',
      source: '^(?:锁屏|锁定屏幕|锁住屏幕|锁定手机)$',
      build: fixed({ action: 'lock_screen' }),
    },
    {
      id: 'screenshot',
      tool: 'navigate',
      source: '^(?:截屏|截图|截个图|截个屏|截一下屏|屏幕截图)$',
      build: fixed({ action: 'screenshot' }),
    },
    {
      id: 'power-menu',
      tool: 'navigate',
      source: '^(?:打开)?(?:电源菜单|关机菜单)$',
      build: fixed({ action: 'power_menu' }),
    },
    {
      id: 'pause',
      tool: 'media',
      source: '^(?:暂停|暂停播放|停止播放|停一下)$',
      build: fixed({ action: 'pause' }),
    },
    {
      id: 'play',
      tool: 'media',
      source: '^(?:播放|继续播放|继续|开始播放|恢复播放)$',
      build: fixed({ action: 'play' }),
    },
    {
      id: 'next',
      tool: 'media',
      source: '^(?:下一首|下一个|下一集|下一个视频|切歌|跳过)$',
      build: fixed({ action: 'next' }),
    },
    {
      id: 'previous',
      tool: 'media',
      source: '^(?:上一首|上一个|上一集|上一个视频)$',
      build: fixed({ action: 'previous' }),
    },
    {
      id: 'open',
      tool: 'open_app',
      source: '^(?:打开|开启|启动|进入|去)(?<app>.+?)(?:应用|app)?$',
      build: (g) => ({ app: (g.app ?? '').trim() }),
    },
    {
      id: 'scroll',
      tool: 'scroll',
      source: ['^(?:向|往)?(?<direction>上|下|左|右)(?:滚动|滑动|滑|翻|划)$', '^(?:滚动|滑动)$'],
      build: (g) => ({ direction: lookup(g.direction, DIRECTIONS, 'down') }),
    },
  ],
  prefixes: [
    /^(?:(?:嘿|嗨|你好|ok)\s*)?sigil[\s,，:：!！。]*/iu,
    /^(?:请帮我|麻烦你|麻烦|帮我|请|能不能|可以)\s*/u,
  ],
  suffixes: [/(?:一下|吧|好吗|可以吗|谢谢)$/u],
  yes: ['是', '是的', '对', '对的', '好', '好的', '好吧', '可以', '确认', '发送', '发吧', '发', '行', '没问题', '嗯'],
  no: ['不', '不要', '不是', '不用', '取消', '算了', '等一下', '等等', '别发', '别'],
  sensitive: ['发送', '发布', '分享', '转发', '拨打', '呼叫', '删除', '移除', '支付', '付款', '购买', '下单', '订阅', '转账', '确认', '卸载'],
  bulk: [
    /所有(?:的)?(?:联系人|朋友|好友|粉丝|群|群组|帖子|照片|视频|评论|消息|人)|每个人|大家|全部(?:联系人|好友)|群发|批量/u,
    /(?:[2-9]|[1-9][0-9]+|[两二三四五六七八九十百][〇零一二三四五六七八九十百]*)(?:次|遍)/u,
    /每(?:秒|分钟|小时|天|早上|晚上)/u,
  ],
  severalPeople: [/[、，,]/u, /(.{2,})(?:和|跟|与|及)(.{2,})/u],
  askMessageText: (contact) => `要给${contact}发什么内容？`,
};
