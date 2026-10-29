import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { needsTour, type TourRecord } from '../onboarding/machine';
import { setHapticsEnabled } from '../ui/haptics';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type Preferences } from './storage';

export interface PreferencesValue {
  /** False for the first frame on the web, where the store is read after the page hydrates. */
  ready: boolean;
  tour: TourRecord | null;
  haptics: boolean;
  /** True on the first launch and when a newer tutorial exists. */
  needsTour: boolean;
  completeTour: (record: TourRecord) => void;
  setHaptics: (value: boolean) => void;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** The phone reads the file at once; the web waits for the browser, so the server render and hydration agree. */
const READ_LATER = Platform.OS === 'web';

function read(): Preferences {
  const loaded = loadPreferences();
  setHapticsEnabled(loaded.haptics);
  return loaded;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences | null>(() => (READ_LATER ? null : read()));

  useEffect(() => {
    if (preferences === null) setPreferences(read());
  }, [preferences]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...(current ?? DEFAULT_PREFERENCES), ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const completeTour = useCallback((record: TourRecord) => update({ tour: record }), [update]);
  const setHaptics = useCallback(
    (value: boolean) => {
      setHapticsEnabled(value);
      update({ haptics: value });
    },
    [update],
  );

  const value = useMemo<PreferencesValue>(() => {
    const current = preferences ?? DEFAULT_PREFERENCES;
    return {
      ready: preferences !== null,
      tour: current.tour,
      haptics: current.haptics,
      needsTour: needsTour(current.tour),
      completeTour,
      setHaptics,
    };
  }, [preferences, completeTour, setHaptics]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const value = useContext(PreferencesContext);
  if (!value) {
    throw new Error('usePreferences needs a PreferencesProvider above it.');
  }
  return value;
}
