import { useLocales } from 'expo-localization';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { ProfileRegistry } from '../app-profiles/registry';
import { appNameResolver, type DescribeContext } from './describe';
import { numberFormatter, type NumberFormatter } from './format';
import { resolveLanguage, speechLocaleFor, type AppLanguage, type LanguageChoice } from './languages';
import { MESSAGES, type Messages } from './messages';
import { loadLanguageChoice, saveLanguageChoice } from './storage';

export interface I18n {
  /** Language in use. */
  language: AppLanguage;
  /** What the user picked: one language, or system to follow the phone. */
  choice: LanguageChoice;
  /** The phone's language, as Sigil resolves it. Used while choice is system. */
  deviceLanguage: AppLanguage;
  messages: Messages;
  format: NumberFormatter;
  /** BCP 47 locale for speech recognition and the voice planner. */
  speechLocale: string;
  setChoice: (choice: LanguageChoice) => void;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * Detects the phone's language with expo-localization (English when Sigil is
 * not translated into it), lets the user pick another one, and remembers the
 * pick. Follows the phone again, live, when the user picks system.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const locales = useLocales();
  const [choice, setChoiceState] = useState<LanguageChoice>(loadLanguageChoice);
  const deviceLanguage = resolveLanguage(locales);
  const language = choice === 'system' ? deviceLanguage : choice;

  const setChoice = useCallback((next: LanguageChoice) => {
    setChoiceState(next);
    saveLanguageChoice(next);
  }, []);

  const value = useMemo<I18n>(
    () => ({
      language,
      choice,
      deviceLanguage,
      messages: MESSAGES[language],
      format: numberFormatter(language),
      speechLocale: speechLocaleFor(language, locales),
      setChoice,
    }),
    [language, choice, deviceLanguage, locales, setChoice],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n needs an I18nProvider above it.');
  }
  return value;
}

/** Messages, number formatting and translated app names, for the describers. */
export function useDescribeContext(profiles: ProfileRegistry): DescribeContext {
  const { messages, format } = useI18n();
  return useMemo(() => ({ m: messages, format, appName: appNameResolver(profiles, messages) }), [messages, format, profiles]);
}
