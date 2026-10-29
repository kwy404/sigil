import { File, Paths } from 'expo-file-system';

import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from './storage.shared';

export { DEFAULT_PREFERENCES, parsePreferences, type Preferences };

/**
 * The preferences file sits next to the language choice (sigil-language.json)
 * in the document directory and uses the same expo-file-system store.
 */
const FILE_NAME = 'sigil-preferences.json';

function preferencesFile(): File | null {
  try {
    return new File(Paths.document, FILE_NAME);
  } catch {
    return null;
  }
}

export function loadPreferences(): Preferences {
  try {
    const file = preferencesFile();
    return file?.exists ? parsePreferences(file.textSync()) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    preferencesFile()?.writeSync(JSON.stringify(preferences));
  } catch {
    // Without storage (tests) the preferences last until the app closes.
  }
}
