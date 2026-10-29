import { useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { getSigil } from '../session';

export interface SpecialAccess {
  /** Notification access for the media session, or null where the phone cannot tell. */
  mediaAccess: boolean | null;
  /** Modify system settings, for the brightness. */
  writeSettings: boolean | null;
}

const UNKNOWN: SpecialAccess = { mediaAccess: null, writeSettings: null };

export function readSpecialAccess(): SpecialAccess {
  try {
    const status = getSigil().native?.getStatus();
    return status ? { mediaAccess: status.mediaAccess, writeSettings: status.writeSettings } : UNKNOWN;
  } catch {
    return UNKNOWN;
  }
}

/** The two special accesses outside the session checklist, read again whenever Sigil comes back to the front. */
export function useSpecialAccess(): SpecialAccess {
  const [access, setAccess] = useState<SpecialAccess>(readSpecialAccess);
  useEffect(() => {
    const refresh = () => setAccess(readSpecialAccess());
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    const timer = setInterval(refresh, 2000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return access;
}

/** Opens the Android screen of a special access. */
export function openSpecialAccess(which: keyof SpecialAccess): void {
  const native = getSigil().native;
  const opened = which === 'mediaAccess' ? native?.openMediaAccessSettings() : native?.openWriteSettings();
  if (!opened && Platform.OS === 'android') {
    const action = which === 'mediaAccess' ? 'android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS' : 'android.settings.action.MANAGE_WRITE_SETTINGS';
    void Linking.sendIntent(action).catch(() => Linking.openSettings());
  }
}
