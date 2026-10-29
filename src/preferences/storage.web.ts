import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from './storage.shared';

export { DEFAULT_PREFERENCES, parsePreferences, type Preferences };

const KEY = 'sigil-preferences';

/** The web preview keeps the preferences in localStorage, since expo-file-system has no web store. */
export function loadPreferences(): Preferences {
  try {
    return parsePreferences(globalThis.localStorage?.getItem(KEY) ?? null);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(preferences));
  } catch {
    // Private windows can refuse storage; the preferences then last for the session.
  }
}
