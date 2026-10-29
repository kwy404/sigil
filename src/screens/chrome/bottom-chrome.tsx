import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Glass } from '../../ui/glass';
import { Glyph, type GlyphName } from '../../ui/glyph';
import { PressableScale } from '../../ui/press';
import { chrome, color } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { CommandPill } from './command-pill';

export type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

type TabKey = 'now' | 'gestures' | 'apps' | 'voice' | 'settings';

const TABS: Record<string, { key: TabKey; icon: GlyphName }> = {
  '(now)': { key: 'now', icon: 'sigil' },
  '(gestures)': { key: 'gestures', icon: 'gesture-open-palm' },
  '(apps)': { key: 'apps', icon: 'app-profile' },
  '(voice)': { key: 'voice', icon: 'voice' },
  '(settings)': { key: 'settings', icon: 'settings' },
};

/**
 * The bottom of every tab: the floating command pill and, under it, the tab
 * bar on glass with a hairline. Pressing the open tab again returns its stack
 * to the top.
 */
export function BottomChrome({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const { messages: m } = useI18n();
  return (
    <View style={styles.root} pointerEvents="box-none">
      <CommandPill style={styles.pill} />
      <Glass style={[styles.bar, { paddingBottom: insets.bottom }]}>
        <View style={styles.hairline} />
        <View style={styles.row} accessibilityRole="tablist">
          {state.routes.map((route, index) => {
            const tab = TABS[route.name];
            if (!tab) return null;
            const focused = index === state.index;
            const label = m.ui.tabs[tab.key];
            const tint = focused ? color.accent : color.text3;
            return (
              <PressableScale
                key={route.key}
                accessibilityRole="tab"
                accessibilityLabel={label}
                accessibilityState={{ selected: focused }}
                haptics="selection"
                scaleTo={0.92}
                onPress={() => {
                  const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigateToTab(route.key);
                }}
                style={styles.tab}>
                <Glyph name={tab.icon} size={25} color={tint} />
                <Txt variant="tab" style={{ color: tint }} numberOfLines={1}>
                  {label}
                </Txt>
              </PressableScale>
            );
          })}
        </View>
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  pill: { marginHorizontal: chrome.pillSide, marginBottom: chrome.pillGap },
  bar: {},
  hairline: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong },
  row: { flexDirection: 'row', height: chrome.tabBar, alignItems: 'center', paddingHorizontal: 4 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: chrome.tabBar, paddingTop: 2 },
});
