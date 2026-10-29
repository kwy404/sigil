/** Languages of the app, as BCP 47 tags. English is the fallback. */
export const APP_LANGUAGES = ['en', 'pt-BR', 'es', 'fr', 'de', 'it', 'ja', 'zh-CN'] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** The language the user picked in Sigil, or system to follow the phone. */
export type LanguageChoice = AppLanguage | 'system';

export const FALLBACK_LANGUAGE: AppLanguage = 'en';

/** Locale used for speech recognition when the phone's own locale does not fit. */
export const SPEECH_LOCALES: Record<AppLanguage, string> = {
  en: 'en-US',
  'pt-BR': 'pt-BR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  ja: 'ja-JP',
  'zh-CN': 'zh-CN',
};

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value);
}

/** The parts of an expo-localization Locale that decide the language. */
export interface DeviceLocale {
  languageTag: string;
  languageCode: string | null;
  languageScriptCode?: string | null;
  regionCode?: string | null;
}

const TRADITIONAL_CHINESE_REGIONS = ['TW', 'HK', 'MO'];

/** The app language for one device locale, or null when Sigil is not translated into it. */
export function languageFor(locale: DeviceLocale): AppLanguage | null {
  const tag = locale.languageTag.replace('_', '-');
  const code = (locale.languageCode ?? tag.split('-')[0]).toLowerCase();
  switch (code) {
    case 'en':
      return 'en';
    case 'pt':
      // Every Portuguese locale gets Brazilian Portuguese, the closest translation.
      return 'pt-BR';
    case 'es':
    case 'fr':
    case 'de':
    case 'it':
    case 'ja':
      return code;
    case 'zh': {
      const parts = tag.split('-').slice(1);
      const script = locale.languageScriptCode ?? parts.find((p) => p.length === 4) ?? null;
      const region = locale.regionCode ?? parts.find((p) => p.length === 2) ?? null;
      const traditional =
        script?.toLowerCase() === 'hant' || (script === null && region !== null && TRADITIONAL_CHINESE_REGIONS.includes(region.toUpperCase()));
      return traditional ? null : 'zh-CN';
    }
    default:
      return null;
  }
}

/** The first of the phone's preferred languages Sigil speaks, or English. */
export function resolveLanguage(locales: readonly DeviceLocale[]): AppLanguage {
  for (const locale of locales) {
    const language = languageFor(locale);
    if (language) {
      return language;
    }
  }
  return FALLBACK_LANGUAGE;
}

/** The phone's locale when it is in the app language (en-GB stays en-GB), else the default for that language. */
export function speechLocaleFor(language: AppLanguage, locales: readonly DeviceLocale[]): string {
  const device = locales.find((locale) => languageFor(locale) === language);
  return device ? device.languageTag.replace('_', '-') : SPEECH_LOCALES[language];
}
