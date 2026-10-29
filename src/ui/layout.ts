import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chrome } from './theme';

/** Height of the compact navigation bar under the status bar. */
export const NAV_BAR = 52;

/** Space the floating chrome (command pill and tab bar) takes at the bottom of a tab screen. */
export function useBottomChrome(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + chrome.tabBar + chrome.pill + chrome.pillGap * 2;
}
