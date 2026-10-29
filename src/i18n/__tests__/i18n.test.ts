import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner } from '../../sigil-core';
import { appNameResolver, describeAction, describeNotice, describePlan, describeStep, type DescribeContext } from '../describe';
import { numberFormatter } from '../format';
import { APP_LANGUAGES, resolveLanguage, SPEECH_LOCALES, speechLocaleFor, type AppLanguage } from '../languages';
import { MESSAGES } from '../messages';

const profiles = ProfileRegistry.withBuiltins();
const planner = new ActionPlanner({ profiles });

function context(language: AppLanguage): DescribeContext {
  const m = MESSAGES[language];
  return { m, format: numberFormatter(language), appName: appNameResolver(profiles, m) };
}

function locale(tag: string, script: string | null = null) {
  const [languageCode, ...rest] = tag.split('-');
  return { languageTag: tag, languageCode, languageScriptCode: script, regionCode: rest.find((p) => p.length === 2) ?? null };
}

/** Every leaf of a messages object, with functions called on sample arguments. */
function leaves(value: unknown, path: string, out: [string, string][]): [string, string][] {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (typeof value === 'function') {
    out.push([path, String((value as (...args: unknown[]) => unknown)('Ana', 'Bruno', 'WhatsApp'))]);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => leaves(item, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      leaves(item, path ? `${path}.${key}` : key, out);
    }
  }
  return out;
}

/** The shape of a messages object: key paths and whether each leaf is text or a function. */
function shape(value: unknown, path = ''): string[] {
  if (typeof value === 'string') return [`${path}:text`];
  if (typeof value === 'function') return [`${path}:function`];
  if (Array.isArray(value)) return [`${path}:list`];
  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, item]) => shape(item, path ? `${path}.${key}` : key))
    .sort();
}

describe('language detection', () => {
  it.each([
    [[locale('pt-BR')], 'pt-BR'],
    [[locale('pt-PT')], 'pt-BR'],
    [[locale('es-MX')], 'es'],
    [[locale('fr-CA')], 'fr'],
    [[locale('de-AT')], 'de'],
    [[locale('it-IT')], 'it'],
    [[locale('ja-JP')], 'ja'],
    [[locale('zh-Hans-CN', 'Hans')], 'zh-CN'],
    [[locale('zh-CN')], 'zh-CN'],
    [[locale('zh-Hant-TW', 'Hant'), locale('ja-JP')], 'ja'],
    [[locale('zh-HK')], 'en'],
    [[locale('ko-KR'), locale('fr-FR')], 'fr'],
    [[locale('ko-KR')], 'en'],
    [[], 'en'],
  ])('reads %j as %s', (locales, language) => {
    expect(resolveLanguage(locales)).toBe(language);
  });

  it('keeps the phone region for speech when it is in the same language', () => {
    expect(speechLocaleFor('en', [locale('en-GB')])).toBe('en-GB');
    expect(speechLocaleFor('fr', [locale('en-US')])).toBe('fr-FR');
    expect(Object.keys(SPEECH_LOCALES)).toEqual([...APP_LANGUAGES]);
  });
});

describe('locale files', () => {
  it('cover the eight languages', () => {
    expect(Object.keys(MESSAGES)).toEqual(['en', 'pt-BR', 'es', 'fr', 'de', 'it', 'ja', 'zh-CN']);
  });

  it.each(APP_LANGUAGES.filter((l) => l !== 'en').map((l) => [l] as const))('%s has the same keys as English', (language) => {
    expect(shape(MESSAGES[language])).toEqual(shape(MESSAGES.en));
    expect(MESSAGES[language].planner.presets).toHaveLength(MESSAGES.en.planner.presets.length);
  });

  it.each(APP_LANGUAGES.map((l) => [l] as const))('%s has no empty text, en or em dash, or emoji', (language) => {
    for (const [path, text] of leaves(MESSAGES[language], '', [])) {
      expect({ path, empty: text.trim().length === 0 }).toEqual({ path, empty: false });
      expect({ path, dash: /[\u2013\u2014]/u.test(text) }).toEqual({ path, dash: false });
      expect({ path, emoji: /\p{Extended_Pictographic}/u.test(text) }).toEqual({ path, emoji: false });
    }
  });

  it('give every language its own words, not English left over', () => {
    for (const language of APP_LANGUAGES.filter((l) => l !== 'en')) {
      const m = MESSAGES[language];
      expect(m.planner.title).not.toBe(MESSAGES.en.planner.title);
      expect(m.notices.bulk()).not.toBe(MESSAGES.en.notices.bulk());
    }
  });
});

describe('planner examples', () => {
  it.each(APP_LANGUAGES.map((l) => [l] as const))('in %s plan, and the last one is refused as bulk', async (language) => {
    const presets = MESSAGES[language].planner.presets;
    const statuses: string[] = [];
    for (const text of presets) {
      statuses.push((await planner.plan({ text, locale: SPEECH_LOCALES[language] })).status);
    }
    expect(statuses).toEqual([...presets.slice(0, -1).map(() => 'planned'), 'blocked']);
  });

  it.each(APP_LANGUAGES.map((l) => [l] as const))('in %s are described without falling back to English', async (language) => {
    const ctx = context(language);
    for (const text of MESSAGES[language].planner.presets) {
      const outcome = await planner.plan({ text, locale: SPEECH_LOCALES[language] });
      if (outcome.status === 'planned') {
        expect(describePlan(outcome.plan, ctx).length).toBeGreaterThan(0);
        outcome.plan.steps.forEach((step, index) => {
          const line = describeStep(step, ctx, outcome.plan, index);
          expect(line.length).toBeGreaterThan(0);
          if (language !== 'en') expect(line).not.toBe(describeStep(step, context('en'), outcome.plan, index));
        });
      } else if (outcome.status !== 'clarify') {
        expect(describeNotice(outcome.notice, ctx)).toBe(ctx.m.notices.bulk());
      }
    }
  });
});

describe('describers', () => {
  it('translate a message plan, its confirmation and the app names', async () => {
    const outcome = await planner.plan({ text: 'manda uma mensagem pra mãe no zap dizendo que estou chegando', locale: 'pt-BR' });
    if (outcome.status !== 'planned') throw new Error(outcome.status);
    const ctx = context('pt-BR');
    expect(describePlan(outcome.plan, ctx)).toBe('Enviar “estou chegando” para mãe no WhatsApp');
    const confirm = outcome.plan.steps.findIndex((s) => s.kind === 'confirm');
    expect(describeStep(outcome.plan.steps[confirm], ctx, outcome.plan, confirm)).toBe(
      'Perguntar: Enviar “estou chegando” para mãe no WhatsApp?',
    );
    expect(context('de').appName('settings')).toBe('Einstellungen');
    expect(context('ja').appName('youtube')).toBe('YouTube');
  });

  it('describe every gesture binding of every profile in every language', () => {
    for (const language of APP_LANGUAGES) {
      const ctx = context(language);
      for (const profile of profiles.list()) {
        for (const binding of profiles.bindings(profile.id)) {
          expect(describeAction(binding.action, ctx).length).toBeGreaterThan(0);
          expect(ctx.m.gestures[binding.key].length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('format numbers and percents the way each language writes them', () => {
    expect(numberFormatter('en').number(1.5, 1)).toBe('1.5');
    expect(numberFormatter('pt-BR').number(1.5, 1)).toBe('1,5');
    expect(numberFormatter('de').number(0.75)).toBe('0,75');
    expect(numberFormatter('en').percent(70)).toBe('70%');
    expect(numberFormatter('fr').percent(70)).toMatch(/^70\s?%$/u);
  });
});
