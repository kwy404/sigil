import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import {
  ActionPlanner,
  cleanAppName,
  findProfile,
  normalizeWebsite,
  pickApp,
  resolveApp,
  type InstalledApp,
  type PlanOutcome,
  type PlanPlatform,
} from '..';

const profiles = ProfileRegistry.withBuiltins();

const PHONE: InstalledApp[] = [
  { label: 'Instagram', packageName: 'com.instagram.android' },
  { label: 'Instagram Lite', packageName: 'com.instagram.lite' },
  { label: 'WhatsApp', packageName: 'com.whatsapp' },
  { label: 'YouTube', packageName: 'com.google.android.youtube' },
  { label: 'Spotify', packageName: 'com.spotify.music' },
  { label: 'Banco Azul', packageName: 'br.com.azul.bank' },
  { label: 'Banco Verde', packageName: 'br.com.verde.bank' },
  { label: 'Nubank', packageName: 'com.nu.production' },
  { label: 'Câmera', packageName: 'com.android.camera2' },
  { label: 'Configurações', packageName: 'com.android.settings' },
];

const catalog = { profiles, installed: PHONE };

function plannerFor(platform: PlanPlatform = 'android', installed: InstalledApp[] = PHONE): ActionPlanner {
  return new ActionPlanner({ profiles, platform, installedApps: () => installed });
}

function planned(outcome: PlanOutcome) {
  if (outcome.status !== 'planned') throw new Error(`${outcome.status}: ${'message' in outcome ? outcome.message : ''}`);
  return outcome.plan;
}

describe('cleanAppName', () => {
  it('drops articles and words for app in the eight languages', () => {
    expect(cleanAppName('o app do Banco Azul')).toBe('banco azul');
    expect(cleanAppName('the Spotify app')).toBe('spotify');
    expect(cleanAppName('la aplicación de Nubank')).toBe('nubank');
    expect(cleanAppName('YouTubeアプリ')).toBe('youtube');
    expect(cleanAppName('微信应用')).toBe('微信');
  });
});

describe('resolveApp', () => {
  it('matches an installed label without accents or case', () => {
    expect(resolveApp('camera', catalog)).toEqual({
      kind: 'one',
      target: { kind: 'installed', label: 'Câmera', packageName: 'com.android.camera2' },
    });
    expect(resolveApp('SPOTIFY', catalog)).toMatchObject({ kind: 'one', target: { packageName: 'com.spotify.music' } });
  });

  it('knows the nicknames people use', () => {
    expect(resolveApp('zap', catalog)).toMatchObject({ kind: 'one', target: { packageName: 'com.whatsapp' } });
    expect(resolveApp('yt', catalog)).toMatchObject({ kind: 'one', target: { packageName: 'com.google.android.youtube' } });
    expect(resolveApp('nu', catalog)).toMatchObject({ kind: 'one', target: { packageName: 'com.nu.production' } });
  });

  it('asks when builds of the same app are installed', () => {
    expect(resolveApp('insta', catalog)).toEqual({
      kind: 'several',
      options: [
        { label: 'Instagram', packageName: 'com.instagram.android' },
        { label: 'Instagram Lite', packageName: 'com.instagram.lite' },
      ],
    });
    expect(resolveApp('Instagram Lite', catalog)).toMatchObject({ kind: 'one', target: { packageName: 'com.instagram.lite' } });
  });

  it('asks when a partial name fits several apps equally', () => {
    expect(resolveApp('o app do banco', catalog)).toEqual({
      kind: 'several',
      options: [
        { label: 'Banco Azul', packageName: 'br.com.azul.bank' },
        { label: 'Banco Verde', packageName: 'br.com.verde.bank' },
      ],
    });
    expect(resolveApp('banco verde', catalog)).toMatchObject({ kind: 'one', target: { packageName: 'br.com.verde.bank' } });
  });

  it('takes an exact package name', () => {
    expect(resolveApp('com.instagram.lite', catalog)).toMatchObject({ kind: 'one', target: { label: 'Instagram Lite' } });
  });

  it('falls back to the default app of a kind, then to known apps', () => {
    expect(resolveApp('calculadora', catalog)).toMatchObject({ kind: 'one', target: { kind: 'system', role: 'calculator' } });
    expect(resolveApp('電卓', catalog)).toMatchObject({ kind: 'one', target: { kind: 'system', role: 'calculator' } });
    expect(resolveApp('Netflix', catalog)).toMatchObject({ kind: 'one', target: { kind: 'known', app: { name: 'Netflix' } } });
    expect(resolveApp('an app nobody has', catalog)).toEqual({ kind: 'none' });
  });

  it('uses profiles where the phone cannot list its apps', () => {
    expect(resolveApp('insta', { profiles, installed: [] })).toMatchObject({ kind: 'one', target: { kind: 'known' } });
    expect(resolveApp('configurações', { profiles, installed: [] })).toMatchObject({
      kind: 'one',
      target: { kind: 'profile', profile: { id: 'settings' } },
    });
  });
});

describe('findProfile', () => {
  it('reaches a profile through a nickname', () => {
    expect(findProfile('zap', profiles)?.id).toBe('whatsapp');
    expect(findProfile('o zapzap', profiles)?.id).toBe('whatsapp');
    expect(findProfile('インスタ', profiles)?.id).toBe('instagram');
    expect(findProfile('nothing like this', profiles)).toBeUndefined();
  });
});

describe('pickApp', () => {
  const options = [
    { label: 'Instagram', app: 'com.instagram.android' },
    { label: 'Instagram Lite', app: 'com.instagram.lite' },
  ];

  it('picks by name, by a word only one option has, or by position', () => {
    expect(pickApp('o Instagram Lite', options)?.app).toBe('com.instagram.lite');
    expect(pickApp('instagram', options)?.app).toBe('com.instagram.android');
    expect(pickApp('the lite one', options)?.app).toBe('com.instagram.lite');
    expect(pickApp('o primeiro', options)?.app).toBe('com.instagram.android');
    expect(pickApp('die zweite', options)?.app).toBe('com.instagram.lite');
    expect(pickApp('二つ目', options)?.app).toBe('com.instagram.lite');
    expect(pickApp('第一个', options)?.app).toBe('com.instagram.android');
    expect(pickApp('la última', options)?.app).toBe('com.instagram.lite');
  });

  it('picks nothing on an unclear answer', () => {
    expect(pickApp('hmm', options)).toBeNull();
    expect(pickApp('', options)).toBeNull();
  });
});

describe('normalizeWebsite', () => {
  it('reads spoken dots and adds https', () => {
    expect(normalizeWebsite('g1 ponto com ponto br')).toBe('https://g1.com.br');
    expect(normalizeWebsite('Wikipedia.org')).toBe('https://wikipedia.org');
    expect(normalizeWebsite('example dot com/news')).toBe('https://example.com/news');
    expect(normalizeWebsite('百度点com')).toBe(null);
    expect(normalizeWebsite('baidu点com')).toBe('https://baidu.com');
    expect(normalizeWebsite('wikipedia')).toBeNull();
  });
});

describe('planning app requests', () => {
  const request = (foregroundPackage: string | null = null) => ({ text: 'test', foregroundPackage });

  it('opens an installed app by its package and waits for it', () => {
    const plan = planned(plannerFor().planIntent({ tool: 'open_app', args: { app: 'Spotify' } }, request()));
    expect(plan.steps).toEqual([
      { kind: 'open_app', app: 'com.spotify.music', label: 'Spotify', packageName: 'com.spotify.music' },
      { kind: 'wait', until: { app: 'com.spotify.music' }, timeoutMs: 8000 },
    ]);
  });

  it('asks which app, then plans the one the user picks', () => {
    const planner = plannerFor();
    const outcome = planner.planIntent({ tool: 'open_app', args: { app: 'insta' } }, request());
    if (outcome.status !== 'choose') throw new Error(outcome.status);
    expect(outcome.options.map((option) => option.label)).toEqual(['Instagram', 'Instagram Lite']);
    const choice = pickApp('o lite', outcome.options);
    expect(choice).not.toBeNull();
    const plan = planned(planner.planChoice(outcome, choice!));
    expect(plan.steps[0]).toMatchObject({ kind: 'open_app', packageName: 'com.instagram.lite' });
  });

  it('says when a known app is not installed', () => {
    const outcome = plannerFor().planIntent({ tool: 'open_app', args: { app: 'Netflix' } }, request());
    expect(outcome).toMatchObject({ status: 'unsupported', notice: { code: 'not_installed', app: 'Netflix' } });
  });

  it('opens the default app of a kind', () => {
    const plan = planned(plannerFor().planIntent({ tool: 'open_app', args: { app: 'calculadora' } }, request()));
    expect(plan.steps).toEqual([{ kind: 'open_app', app: 'role:calculator', label: 'calculadora', role: 'calculator' }]);
  });

  it('closes the app in front or a named one', () => {
    const planner = plannerFor();
    const front = planned(planner.planIntent({ tool: 'close_app', args: {} }, request('com.whatsapp')));
    expect(front.steps).toEqual([{ kind: 'close_app', app: 'com.whatsapp', label: 'WhatsApp', packages: ['com.whatsapp'] }]);
    const named = planned(planner.planIntent({ tool: 'close_app', args: { app: 'YouTube' } }, request()));
    expect(named.steps[0]).toMatchObject({ kind: 'close_app', label: 'YouTube', packages: ['com.google.android.youtube'] });
    expect(planner.planIntent({ tool: 'close_app', args: {} }, request())).toMatchObject({
      status: 'unsupported',
      notice: { code: 'no_app_in_front' },
    });
  });

  it('opens places inside apps, from the app in front when none is named', () => {
    const planner = plannerFor();
    const reels = planned(planner.planIntent({ tool: 'open_place', args: { place: 'reels' } }, request()));
    expect(reels.steps[0]).toMatchObject({ kind: 'open_app', app: 'instagram', url: 'https://www.instagram.com/reels/' });
    const profile = planned(planner.planIntent({ tool: 'open_place', args: { place: 'profile' } }, request('com.zhiliaoapp.musically')));
    expect(profile.steps.map((step) => step.kind)).toEqual(['open_app', 'wait', 'find', 'tap']);
    expect(profile.steps[3]).toMatchObject({ target: { app: 'tiktok', name: 'profileTab' } });
    expect(planner.planIntent({ tool: 'open_place', args: { place: 'reels', app: 'YouTube' } }, request())).toMatchObject({
      status: 'unsupported',
      notice: { code: 'cannot_open_place', place: 'reels' },
    });
  });

  it('opens a website, and searches when the name has no domain', () => {
    const planner = plannerFor();
    const site = planned(planner.planIntent({ tool: 'open_website', args: { url: 'g1 ponto com ponto br' } }, request()));
    expect(site.steps).toEqual([{ kind: 'open_app', app: 'web', label: 'g1.com.br', url: 'https://g1.com.br' }]);
    const search = planned(planner.planIntent({ tool: 'open_website', args: { url: 'wikipedia' } }, request()));
    expect(search.steps[0]).toMatchObject({ kind: 'open_app', url: 'https://www.google.com/search?q=wikipedia' });
  });

  it('closes all apps only with a confirmation step before the clear all tap', () => {
    const plan = planned(plannerFor().planIntent({ tool: 'close_all_apps', args: {} }, request()));
    expect(plan.steps.map((step) => step.kind)).toEqual(['navigate', 'wait', 'confirm', 'tap', 'navigate']);
    expect(plan.steps[2]).toMatchObject({ reason: 'close_all' });
    expect(plan.needsConfirmation).toBe(true);
  });

  it('plans timers, alarms, the flashlight and the tutorial', () => {
    const planner = plannerFor();
    expect(planned(planner.planIntent({ tool: 'set_timer', args: { seconds: 90 } }, request())).steps).toEqual([
      { kind: 'timer', seconds: 90 },
    ]);
    expect(planned(planner.planIntent({ tool: 'set_alarm', args: { hour: 6, minute: 45 } }, request())).steps).toEqual([
      { kind: 'alarm', hour: 6, minute: 45 },
    ]);
    expect(planned(planner.planIntent({ tool: 'flashlight', args: { on: false } }, request())).steps).toEqual([
      { kind: 'torch', on: false },
    ]);
    expect(planned(planner.planIntent({ tool: 'open_tutorial', args: {} }, request())).steps).toEqual([{ kind: 'tutorial' }]);
  });
});

describe('iOS', () => {
  const planner = plannerFor('ios', []);
  const request = { text: 'test' };

  it('opens apps through their links only', () => {
    const plan = planned(planner.planIntent({ tool: 'open_app', args: { app: 'Instagram' } }, request));
    expect(plan.steps).toEqual([
      { kind: 'open_app', app: 'com.instagram.android', label: 'Instagram', packageName: 'com.instagram.android', iosUrl: 'instagram://' },
    ]);
    expect(planner.planIntent({ tool: 'open_app', args: { app: 'calculator' } }, request)).toMatchObject({
      status: 'unsupported',
      notice: { code: 'android_only', feature: 'open' },
    });
  });

  it('says honestly what iOS does not allow', () => {
    const notice = (intent: Parameters<ActionPlanner['planIntent']>[0]) => {
      const outcome = planner.planIntent(intent, request);
      return 'notice' in outcome ? outcome.notice : null;
    };
    expect(notice({ tool: 'close_app', args: { app: 'Instagram' } })).toEqual({ code: 'android_only', feature: 'close' });
    expect(notice({ tool: 'set_timer', args: { seconds: 300 } })).toEqual({ code: 'android_only', feature: 'timer' });
    expect(notice({ tool: 'set_alarm', args: { hour: 7, minute: 0 } })).toEqual({ code: 'android_only', feature: 'alarm' });
    expect(notice({ tool: 'flashlight', args: { on: true } })).toEqual({ code: 'android_only', feature: 'flashlight' });
    expect(notice({ tool: 'open_chat', args: { contact: 'Ana', app: 'WhatsApp' } })).toEqual({ code: 'android_only', feature: 'chat' });
  });
});
