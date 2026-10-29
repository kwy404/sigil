import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ja } from './ja';
import { pt } from './pt';
import { RULE_LANGUAGES, type LanguagePack, type RuleLanguage } from './types';
import { zh } from './zh';

export { RULE_LANGUAGES, type LanguagePack, type Rule, type RuleArgs, type RuleLanguage } from './types';

/**
 * Every language Sigil understands, in the order tried when the request's
 * locale is unknown. To add a language, write its pack next to these and add
 * it here and to RULE_LANGUAGES; the tests then require phrasings for every
 * core command.
 */
export const LANGUAGE_PACKS: readonly LanguagePack[] = [en, pt, es, fr, de, it, ja, zh];

/** The rule language of a BCP 47 locale such as pt-BR, zh-Hans-CN or ja, or null when Sigil does not speak it. */
export function ruleLanguage(locale?: string | null): RuleLanguage | null {
  const primary = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  return (RULE_LANGUAGES as readonly string[]).includes(primary) ? (primary as RuleLanguage) : null;
}

/** The language packs with the one of the locale first. */
export function packsFor(locale?: string | null): readonly LanguagePack[] {
  const preferred = ruleLanguage(locale);
  if (!preferred) {
    return LANGUAGE_PACKS;
  }
  const first = LANGUAGE_PACKS.find((pack) => pack.id === preferred);
  return first ? [first, ...LANGUAGE_PACKS.filter((pack) => pack !== first)] : LANGUAGE_PACKS;
}
