import { parseTourRecord } from '../onboarding/machine';
import { readSettings, updateSettings } from '../settings/store';
import { DEFAULT_PREFERENCES, parsePreferences, type Preferences } from './storage.shared';

export { DEFAULT_PREFERENCES, parsePreferences, type Preferences };

/**
 * The preferences live in the same settings file as the language choice
 * (src/settings/store.ts, expo-file-system): the tutorial completion under
 * tutorial, with its version, and the haptics switch.
 */
export function loadPreferences(): Preferences {
  try {
    const saved = readSettings();
    return {
      tour: saved.tutorial?.completed ? parseTourRecord(saved.tutorial) : null,
      haptics: saved.haptics !== false,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(preferences: Preferences): void {
  const tour = preferences.tour;
  updateSettings({
    tutorial: tour ? { version: tour.version, completed: true, completedAt: tour.completedAt, skipped: tour.skipped } : undefined,
    haptics: preferences.haptics,
  });
}
