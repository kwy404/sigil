import { useSyncExternalStore } from 'react';

import type { InstalledApp } from '../sigil-core/apps';
import { getNativeControl } from './native';

const NONE: readonly InstalledApp[] = [];

let apps: readonly InstalledApp[] = NONE;
let reading: Promise<readonly InstalledApp[]> | null = null;
let watching = false;
const listeners = new Set<() => void>();

function publish(next: readonly InstalledApp[]): void {
  apps = next;
  listeners.forEach((listener) => listener());
}

/**
 * Reads the launchable apps again from Android. The native side caches the
 * list, so this is cheap after the first call; on iOS, the web and in Expo Go
 * the list stays empty and the planner works from profiles and known apps.
 */
export function refreshInstalledApps(): Promise<readonly InstalledApp[]> {
  const native = getNativeControl();
  if (!native) {
    return Promise.resolve(apps);
  }
  if (!watching) {
    watching = true;
    native.addListener('onAppsChanged', () => {
      void refreshInstalledApps();
    });
  }
  reading ??= native
    .getLaunchableApps()
    .then((list) => {
      publish(list.map(({ label, packageName }) => ({ label, packageName })));
      return apps;
    })
    .catch(() => apps)
    .finally(() => {
      reading = null;
    });
  return reading;
}

/** The apps last read from the phone. Empty until the first read ends. Pass this function to the planner. */
export function installedApps(): readonly InstalledApp[] {
  return apps;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (apps === NONE) {
    void refreshInstalledApps();
  }
  return () => listeners.delete(listener);
}

/** The launchable apps, kept current when apps are installed or removed. */
export function useInstalledApps(): readonly InstalledApp[] {
  return useSyncExternalStore(subscribe, installedApps, installedApps);
}
