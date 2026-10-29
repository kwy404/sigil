/**
 * Deterministic parser for voice requests in English, Brazilian Portuguese,
 * Spanish, French, German, Italian, Japanese and Simplified Chinese. It is the
 * fallback when no language model is loaded, and it produces the same intent
 * tool calls a model would. The phrasing of each language lives in
 * ./languages; this file only cleans requests and runs the rules.
 */
import { LANGUAGE_PACKS, packsFor } from './languages';
import { escapeRegExp, loose } from './languages/helpers';
import type { Groups, LanguagePack, RuleArgs, RuleLanguage } from './languages/types';
import type { ToolName } from './tools';

export interface RuleMatch {
  tool: ToolName;
  args: RuleArgs;
  /** Id of the rule that matched. */
  rule: string;
  /** Language of the rule that matched. */
  language: RuleLanguage;
}

/** Full width digits, percent sign and point, as Japanese and Chinese input methods write them. */
function halfWidth(text: string): string {
  return text.replace(/[\uff10-\uff19\uff05\uff0e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

const PREFIXES = LANGUAGE_PACKS.flatMap((pack) => pack.prefixes);
const SUFFIXES = LANGUAGE_PACKS.flatMap((pack) => pack.suffixes);

/** Normalizes quotes, widths and spacing and drops wake words, polite words and final punctuation. */
export function cleanRequest(text: string): string {
  let s = halfWidth(text)
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u3000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[¿¡]+/u, '');
  for (let pass = 0; pass < 3; pass++) {
    const before = s;
    for (const prefix of PREFIXES) {
      s = s.replace(prefix, '');
    }
    if (s === before) {
      break;
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    const before = s;
    s = s.replace(/[\s.!?。！？…,，、]+$/u, '');
    for (const suffix of SUFFIXES) {
      s = s.replace(suffix, '');
    }
    if (s === before) {
      break;
    }
  }
  return s.replace(/^[¿¡]+/u, '').trim();
}

type CompiledRule = { patterns: RegExp[] };

const compiledCache = new Map<string, Map<RuleLanguage, CompiledRule[]>>();

function expand(source: string, pack: LanguagePack, apps: string): string {
  let out = source.split('APPS').join(apps);
  const tokens = Object.keys(pack.vocab).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    out = out.split(token).join(pack.vocab[token]);
  }
  return loose(out);
}

function compile(appNames: readonly string[]): Map<RuleLanguage, CompiledRule[]> {
  const names = [...new Set(appNames.map((n) => n.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const apps = `(?:${names.length > 0 ? names.map(escapeRegExp).join('|') : '(?!)'})`;
  let compiled = compiledCache.get(apps);
  if (!compiled) {
    compiled = new Map();
    for (const pack of LANGUAGE_PACKS) {
      compiled.set(
        pack.id,
        pack.rules.map((rule) => ({
          patterns: (typeof rule.source === 'string' ? [rule.source] : rule.source).map(
            (source) => new RegExp(expand(source, pack, apps), 'iu'),
          ),
        })),
      );
    }
    compiledCache.set(apps, compiled);
  }
  return compiled;
}

function usable(args: RuleArgs | null): args is RuleArgs {
  return args !== null && Object.values(args).every((v) => (typeof v === 'number' ? Number.isFinite(v) : v.length > 0));
}

/**
 * Matches a request against the rules, trying the language of the locale
 * first and then the others. appNames lists the app names and aliases a
 * request may name, as in "on WhatsApp", "no zap" or "で YouTube".
 */
export function parseRequest(text: string, appNames: readonly string[], locale?: string | null): RuleMatch | null {
  const cleaned = cleanRequest(text);
  if (!cleaned) {
    return null;
  }
  const compiled = compile(appNames);
  for (const pack of packsFor(locale)) {
    const rules = compiled.get(pack.id) ?? [];
    for (let i = 0; i < pack.rules.length; i++) {
      for (const pattern of rules[i].patterns) {
        const match = pattern.exec(cleaned);
        if (!match) {
          continue;
        }
        const args = pack.rules[i].build((match.groups ?? {}) as Groups);
        if (usable(args)) {
          return { tool: pack.rules[i].tool, args, rule: pack.rules[i].id, language: pack.id };
        }
      }
    }
  }
  return null;
}
