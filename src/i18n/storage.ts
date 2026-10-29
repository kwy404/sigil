import { readSettings, updateSettings } from '../settings/store';
import { isAppLanguage, type LanguageChoice } from './languages';

/** The language picked in Sigil, or system when the user never picked one or the settings cannot be read. */
export function loadLanguageChoice(): LanguageChoice {
  const { language } = readSettings();
  return isAppLanguage(language) ? language : 'system';
}

/** Remembers the choice for the next launch, in the same settings file as the tutorial. Following the phone again removes it. */
export function saveLanguageChoice(choice: LanguageChoice): void {
  updateSettings({ language: choice === 'system' ? undefined : choice });
}
