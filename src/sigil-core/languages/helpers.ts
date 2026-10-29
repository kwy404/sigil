import type { AppPlace } from '../../app-profiles/schema';
import { foldText } from '../../app-profiles/text';
import type { Groups, RuleArgs } from './types';

/** Accented letters and the plain spellings people type or speech engines write for them. */
const LOOSE: Record<string, string[]> = {
  á: ['a'],
  à: ['a'],
  â: ['a'],
  ã: ['a'],
  ä: ['a', 'ae'],
  é: ['e'],
  è: ['e'],
  ê: ['e'],
  ë: ['e'],
  í: ['i'],
  ì: ['i'],
  î: ['i'],
  ï: ['i'],
  ó: ['o'],
  ò: ['o'],
  ô: ['o'],
  õ: ['o'],
  ö: ['o', 'oe'],
  ú: ['u'],
  ù: ['u'],
  û: ['u'],
  ü: ['u', 'ue'],
  ç: ['c'],
  ñ: ['n'],
  ß: ['ss'],
};

/**
 * Makes every accented letter of a regular expression source also match its
 * plain spelling, so "notificações" matches "notificacoes" and "zurück"
 * matches "zuruck" and "zurueck". Escapes and character classes are kept.
 */
export function loose(source: string): string {
  let out = '';
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\') {
      out += c + (source[i + 1] ?? '');
      i++;
      continue;
    }
    if (inClass) {
      if (c === ']') inClass = false;
      const plain = LOOSE[c]?.filter((p) => p.length === 1) ?? [];
      out += c + plain.join('');
      continue;
    }
    if (c === '[') {
      inClass = true;
      out += c;
      continue;
    }
    const alternatives = LOOSE[c];
    if (!alternatives) {
      out += c;
    } else if (alternatives.every((a) => a.length === 1)) {
      out += `[${c}${alternatives.join('')}]`;
    } else {
      out += `(?:${[c, ...alternatives].join('|')})`;
    }
  }
  return out;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Folds a spoken word for lookups: case, accents, ß, and German ae, oe, ue spellings. */
function foldWord(value: string): string {
  return foldText(value.trim().toLowerCase()).replace(/ß/g, 'ss').replace(/\s+/g, ' ').replace(/-/g, ' ');
}

/** Number words of a language, with their values, for a NUM token. */
export class NumberWords {
  private readonly words = new Map<string, number>();
  private readonly spellings: string[];

  constructor(entries: Iterable<[string, number]>) {
    const spellings = new Set<string>();
    for (const [word, value] of entries) {
      this.words.set(foldWord(word), value);
      spellings.add(word.toLowerCase());
    }
    this.spellings = [...spellings].sort((a, b) => b.length - a.length);
  }

  /**
   * Regular expression alternation of the words, longest first, plus digits
   * with a decimal point or comma. Words keep their accents; loose() later
   * lets them match without.
   */
  pattern(): string {
    const words = this.spellings.map((w) => escapeRegExp(w).replace(/[ -]/g, '[ -]'));
    return `(?:\\d+(?:[.,]\\d+)?|${words.join('|')})`;
  }

  parse(token: string | undefined): number | null {
    if (token === undefined) return null;
    const trimmed = token.trim();
    if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
      return Number(trimmed.replace(',', '.'));
    }
    const folded = foldWord(trimmed);
    const direct = this.words.get(folded);
    if (direct !== undefined) return direct;
    const umlauts = folded.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
    return this.words.get(umlauts) ?? null;
  }
}

/** Builds number words from 0 to 100 from the parts of a language that composes them regularly. */
export function composeNumbers(options: {
  units: string[];
  teens: string[];
  tens: string[];
  compose: (ten: string, unit: string, unitValue: number, tenValue: number) => string[];
  extra?: [string, number][];
}): [string, number][] {
  const out: [string, number][] = [];
  options.units.forEach((word, value) => out.push([word, value]));
  options.teens.forEach((word, i) => out.push([word, 10 + i]));
  for (let t = 2; t < 10; t++) {
    const ten = options.tens[t];
    if (!ten) continue;
    out.push([ten, t * 10]);
    for (let u = 1; u < 10; u++) {
      for (const word of options.compose(ten, options.units[u], u, t)) {
        out.push([word, t * 10 + u]);
      }
    }
  }
  return [...out, ...(options.extra ?? [])];
}

const CJK_DIGITS: Record<string, number> = {
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** Reads Arabic digits or Chinese and Japanese numerals up to 999, such as 三十, 十五 or 一百. */
export function parseCjkNumber(token: string | undefined): number | null {
  if (token === undefined) return null;
  const trimmed = token.trim();
  if (/^\d+(?:[.,]\d+)?$/.test(trimmed)) {
    return Number(trimmed.replace(',', '.'));
  }
  if (trimmed === '半') return 0.5;
  let total = 0;
  let current = 0;
  for (const c of trimmed) {
    if (c in CJK_DIGITS) {
      current = CJK_DIGITS[c];
    } else if (c === '十') {
      total += (current || 1) * 10;
      current = 0;
    } else if (c === '百') {
      total += (current || 1) * 100;
      current = 0;
    } else {
      return null;
    }
  }
  return total + current;
}

export const CJK_NUM = '(?:\\d+(?:[.,]\\d+)?|[〇零一二两三四五六七八九十百]+)';

export function fixed(args: RuleArgs): (g: Groups) => RuleArgs {
  return () => args;
}

export function unquote(value: string): string {
  return value.replace(/^["'«»「」『』“”]+|["'«»「」『』“”]+$/g, '').trim();
}

/** Adds app to the arguments when the request named one. */
export function withApp(g: Groups, args: RuleArgs): RuleArgs {
  const app = g.app ?? g.app1 ?? g.app2;
  return app ? { ...args, app: app.trim() } : args;
}

/**
 * Builds send_message arguments. Returns null when the text is only the word
 * for message, so a later rule can ask what to write.
 */
export function messageArgs(
  g: Groups,
  cleanContact: (contact: string) => string,
  bareMessage: RegExp,
): RuleArgs | null {
  const contact = cleanContact(unquote(g.contact ?? ''));
  const text = unquote(g.text ?? '');
  if (!contact || !text || bareMessage.test(text)) {
    return null;
  }
  return withApp(g, { contact, text });
}

/** Removes leading words such as "my" or "a" from a spoken contact. */
export function contactCleaner(leading: RegExp): (contact: string) => string {
  return (contact) => contact.replace(leading, '').trim();
}

/** Seconds from a number and a unit, when the unit is a minute word. */
export function toSeconds(value: number | null, unit: string | undefined, minute: RegExp): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const seconds = Math.round(minute.test(unit ?? '') ? value * 60 : value);
  return seconds >= 1 && seconds <= 3600 ? seconds : null;
}

export function percent(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 0 && rounded <= 100 ? rounded : null;
}

export function speedRate(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return value >= 0.25 && value <= 4 ? value : null;
}

/** Unit words of a language for spoken durations. */
export interface DurationUnits {
  hour: RegExp;
  minute: RegExp;
  second: RegExp;
}

/**
 * Seconds of a spoken duration made of number and unit pairs, as in "1 hour
 * 30 minutes", for a timer. half adds half of the last unit, as in "a minute
 * and a half". Null when a part is not a number or the total is not between
 * one second and 24 hours.
 */
export function durationSeconds(
  parts: readonly [number | null, string | undefined][],
  units: DurationUnits,
  half = false,
): number | null {
  let total = 0;
  let last = 0;
  for (const [value, unit] of parts) {
    if (unit === undefined) continue;
    if (value === null || !Number.isFinite(value) || value < 0) return null;
    const size = units.hour.test(unit) ? 3600 : units.minute.test(unit) ? 60 : units.second.test(unit) ? 1 : 0;
    if (size === 0) return null;
    total += value * size;
    last = size;
  }
  if (last === 0) return null;
  const seconds = Math.round(total + (half ? last / 2 : 0));
  return seconds >= 1 && seconds <= 86400 ? seconds : null;
}

/**
 * Morning or evening, when a spoken time says which. night is evening for 6
 * to 11 and the small hours otherwise, as in "11 at night" and "2 at night".
 */
export type DayPeriod = 'am' | 'pm' | 'night' | null;

/**
 * Alarm arguments from a spoken hour and minutes. pm moves 1 to 11 to the
 * afternoon and am moves 12 to midnight. Null for times that do not exist.
 */
export function clockTime(hour: number | null, minute: number | null = 0, period: DayPeriod = null): RuleArgs | null {
  if (hour === null || minute === null || !Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (minute < 0 || minute > 59) return null;
  let h = hour;
  if ((period === 'pm' && h >= 1 && h < 12) || (period === 'night' && h >= 6 && h < 12)) h += 12;
  if ((period === 'am' || period === 'night') && h === 12) h = 0;
  return h >= 0 && h <= 23 ? { hour: h, minute } : null;
}

/** The hour before, on a twelve hour dial: "quarter to one" is 12:45, not 0:45. */
export function hourBefore(hour: number | null): number | null {
  if (hour === null) return null;
  return hour <= 1 ? hour + 11 : hour - 1;
}

/** Hour and minutes of a written time such as 7:30, 7h30, 7.30 or 19h. */
export function compactTime(text: string | undefined): [number, number] | null {
  const match = /^(\d{1,2})(?:[:h.](\d{2})?)?$/iu.exec(text?.trim() ?? '');
  return match ? [Number(match[1]), Number(match[2] ?? 0)] : null;
}

/**
 * open_place arguments. A generic word such as "messages" needs an app name,
 * so "open messages" stays a request to open the messaging app.
 */
export function placeArgs(g: Groups, place: AppPlace | '', generic: RegExp): RuleArgs | null {
  if (!place) return null;
  if (!(g.app ?? g.app1 ?? g.app2) && generic.test((g.place ?? '').trim())) return null;
  return withApp(g, { place });
}

/** Picks the first key whose pattern matches the word, for directions, streams and similar small vocabularies. */
export function lookup<T extends string>(word: string | undefined, table: [RegExp, T][], fallback: T): T {
  if (word === undefined) return fallback;
  for (const [pattern, value] of table) {
    if (pattern.test(word)) return value;
  }
  return fallback;
}
