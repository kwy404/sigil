import { parseTourRecord, type TourRecord } from '../onboarding/machine';

/**
 * App preferences: the tutorial completion (with its version, so a newer
 * tutorial shows again) and the haptics switch.
 */
export interface Preferences {
  tour: TourRecord | null;
  haptics: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { tour: null, haptics: true };

export function parsePreferences(text: string | null): Preferences {
  if (!text) return DEFAULT_PREFERENCES;
  try {
    const saved = JSON.parse(text) as { tour?: unknown; haptics?: unknown };
    return {
      tour: parseTourRecord(saved.tour),
      haptics: typeof saved.haptics === 'boolean' ? saved.haptics : true,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}
