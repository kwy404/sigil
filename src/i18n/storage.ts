import { File, Paths } from 'expo-file-system';

import { isAppLanguage, type LanguageChoice } from './languages';

const FILE_NAME = 'sigil-language.json';

function choiceFile(): File | null {
  try {
    return new File(Paths.document, FILE_NAME);
  } catch {
    return null;
  }
}

/** The language picked in Sigil, or system when the user never picked one or the file cannot be read. */
export function loadLanguageChoice(): LanguageChoice {
  try {
    const file = choiceFile();
    if (!file?.exists) {
      return 'system';
    }
    const saved = JSON.parse(file.textSync()) as { language?: unknown };
    return isAppLanguage(saved.language) ? saved.language : 'system';
  } catch {
    return 'system';
  }
}

/** Remembers the choice for the next launch. Following the phone again removes the file. */
export function saveLanguageChoice(choice: LanguageChoice): void {
  try {
    const file = choiceFile();
    if (!file) {
      return;
    }
    if (choice === 'system') {
      if (file.exists) file.delete();
      return;
    }
    file.writeSync(JSON.stringify({ language: choice }));
  } catch {
    // Without storage (the web, tests) the choice lasts until the app closes.
  }
}
