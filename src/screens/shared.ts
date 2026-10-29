import { router, useSegments, type Href } from 'expo-router';

import { GENERAL_PROFILE_ID, ProfileRegistry, type ResolvedBinding } from '../app-profiles';
import { isGestureKey, type GestureKey } from '../gesture-engine/gestures';
import { useI18n } from '../i18n';
import { ActionPlanner } from '../sigil-core';

/** The built in gesture profiles, validated once for every screen. */
export const registry = ProfileRegistry.withBuiltins();

/** The rule planner the dry runs use. It plans and never acts. */
export const dryRunPlanner = new ActionPlanner({ profiles: registry });

export function generalBinding(key: string): ResolvedBinding | null {
  return isGestureKey(key) ? registry.resolve(null, key) : null;
}

/** Bindings an app profile sets itself, for the gesture keys given. */
export function appOverrides(keys: readonly GestureKey[]): { profileId: string; binding: ResolvedBinding }[] {
  const out: { profileId: string; binding: ResolvedBinding }[] = [];
  for (const profile of registry.list()) {
    if (profile.id === GENERAL_PROFILE_ID) continue;
    for (const binding of registry.bindings(profile.id)) {
      if (!binding.inherited && keys.includes(binding.key)) {
        out.push({ profileId: profile.id, binding });
      }
    }
  }
  return out;
}

export type TabKey = 'now' | 'gestures' | 'apps' | 'voice' | 'settings';

const TAB_GROUPS: Record<string, TabKey> = {
  '(now)': 'now',
  '(gestures)': 'gestures',
  '(apps)': 'apps',
  '(voice)': 'voice',
  '(settings)': 'settings',
};

/** The tab the current page lives in. */
export function useCurrentTab(): TabKey {
  const segments = useSegments() as string[];
  for (const segment of segments) {
    const tab = TAB_GROUPS[segment];
    if (tab) return tab;
  }
  return 'now';
}

/** The label of the tab a pushed page returns to. */
export function useBackLabel(): string {
  const { messages: m } = useI18n();
  return m.ui.tabs[useCurrentTab()];
}

const go = (path: string) => router.push(path as Href);

/**
 * Pages open inside the tab the user is in, so the tab stays selected, the
 * pill stays, and Back returns where they came from. Each detail page has its
 * own address in its home tab (/gestures/pinch, /apps/whatsapp), which deep
 * links use too.
 */
export function useOpen() {
  const tab = useCurrentTab();
  const inTab = (path: string) => go(`/(tabs)/(${tab})/${path}`);
  return {
    gesture: (albumId: string) => (tab === 'gestures' ? go(`/gestures/${albumId}`) : inTab(`gesture/${albumId}`)),
    practice: (albumId: string) => (tab === 'gestures' ? go(`/gestures/${albumId}/practice`) : inTab(`practice/${albumId}`)),
    app: (profileId: string) => (tab === 'apps' ? go(`/apps/${profileId}`) : inTab(`app/${profileId}`)),
    command: (text?: string) => router.push((text ? { pathname: '/command', params: { text } } : '/command') as Href),
    live: () => go('/live'),
  };
}

export function tabHref(tab: TabKey): Href {
  return (tab === 'now' ? '/' : `/${tab}`) as Href;
}
