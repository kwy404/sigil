import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './glass';
import { Glyph } from './glyph';
import { NAV_BAR, useBottomChrome } from './layout';
import { PressableScale } from './press';
import { color, GUTTER } from './theme';
import { Txt } from './type';

export interface ScreenProps {
  /** Large title at the top; it collapses into the navigation bar on scroll. */
  title: string;
  /** Hide the large title, for pages whose hero carries the title (gesture, app). */
  hideLargeTitle?: boolean;
  /** The parent page, for the back button. Without it the screen is a tab root. */
  back?: { label: string; onPress?: () => void };
  /** Right of the large title (status chips). */
  accessory?: ReactNode;
  /** Right side of the navigation bar. */
  headerRight?: ReactNode;
  /** Scroll offset at which the compact title appears, when the hero is taller than a large title. */
  collapseAt?: number;
  /** Tab roots leave room for the floating chrome; sheets and the tutorial do not. */
  bottomChrome?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

const LARGE_TITLE = 56;

/**
 * Every page of the app: a large title that collapses into a compact glass
 * navigation bar, an optional back button, and room for the floating chrome.
 * Pushed pages get a native stack transition from the router.
 */
export function Screen({
  title,
  hideLargeTitle,
  back,
  accessory,
  headerRight,
  collapseAt,
  bottomChrome = true,
  contentStyle,
  children,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const chromeBottom = useBottomChrome();
  const reduceMotion = useReducedMotion();
  const scrollY = useSharedValue(0);
  const hasBar = back !== undefined || headerRight !== undefined;
  const barHeight = insets.top + NAV_BAR;
  const threshold = collapseAt ?? (hideLargeTitle ? 24 : LARGE_TITLE - 8);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollY.set(event.contentOffset.y);
  });

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.get(), [threshold - 16, threshold + 8], [0, 1], Extrapolation.CLAMP),
  }));
  const compactTitle = useAnimatedStyle(() => {
    const k = interpolate(scrollY.get(), [threshold - 4, threshold + 16], [0, 1], Extrapolation.CLAMP);
    return { opacity: k, transform: [{ translateY: reduceMotion ? 0 : (1 - k) * 6 }] };
  });
  const largeTitle = useAnimatedStyle(() => {
    if (reduceMotion) return { transform: [{ scale: 1 }] };
    const stretch = interpolate(scrollY.get(), [-160, 0], [1.08, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: stretch }] };
  });

  const goBack = () => {
    if (back?.onPress) {
      back.onPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <View style={styles.root}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          {
            paddingTop: hasBar ? barHeight + 4 : insets.top + 12,
            paddingBottom: (bottomChrome ? chromeBottom : insets.bottom) + 32,
          },
          contentStyle,
        ]}>
        {hideLargeTitle ? null : (
          <View style={styles.largeRow}>
            <Animated.View style={[styles.largeTitle, { transformOrigin: 'left center' }, largeTitle]}>
              <Txt variant="largeTitle" accessibilityRole="header" numberOfLines={2}>
                {title}
              </Txt>
            </Animated.View>
            {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
          </View>
        )}
        {children}
      </Animated.ScrollView>

      <View style={[styles.bar, { height: hasBar ? barHeight : insets.top + 44 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, barStyle]} pointerEvents="none">
          <Glass style={StyleSheet.absoluteFill} />
          <View style={styles.hairline} />
        </Animated.View>
        <View style={[styles.barRow, { marginTop: insets.top, height: hasBar ? NAV_BAR : 44 }]} pointerEvents="box-none">
          <View style={styles.barSide} pointerEvents="box-none">
            {back ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={back.label}
                onPress={goBack}
                hitSlop={8}
                scaleTo={0.94}
                style={styles.back}>
                <Glyph name="chevron-left" size={24} color={color.accent} />
                <Txt variant="subhead" tone="accent" numberOfLines={1} style={styles.backLabel}>
                  {back.label}
                </Txt>
              </PressableScale>
            ) : null}
          </View>
          <Animated.View style={[styles.barTitle, compactTitle]} pointerEvents="none">
            <Txt variant="headline" numberOfLines={1} align="center">
              {title}
            </Txt>
          </Animated.View>
          <View style={[styles.barSide, styles.barRight]} pointerEvents="box-none">
            {headerRight}
          </View>
        </View>
      </View>
    </View>
  );
}

/** A titled block of a page, with an optional action on the right ("See all"). */
export function Section({
  title,
  caption,
  action,
  children,
  inset = true,
  style,
}: {
  title?: string;
  caption?: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
  /** Pad the header to the screen gutter. Shelves pad their own content. */
  inset?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <View style={[styles.sectionHeader, inset ? null : styles.sectionHeaderInset]}>
          <View style={styles.sectionTitleRow}>
            <Txt variant="title2" accessibilityRole="header" style={styles.sectionTitle}>
              {title}
            </Txt>
            {action ? (
              <PressableScale accessibilityRole="button" onPress={action.onPress} hitSlop={10} style={styles.sectionAction}>
                <Txt variant="subhead" tone="accent" numberOfLines={1}>
                  {action.label}
                </Txt>
              </PressableScale>
            ) : null}
          </View>
          {caption ? (
            <Txt variant="footnote" tone="tertiary">
              {caption}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  largeRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: GUTTER,
    minHeight: LARGE_TITLE,
    paddingBottom: 8,
  },
  largeTitle: { flexShrink: 1 },
  accessory: { paddingBottom: 6 },
  bar: { position: 'absolute', left: 0, right: 0, top: 0 },
  hairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: color.hairlineStrong,
  },
  barRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8 },
  barSide: { width: 112, flexDirection: 'row', alignItems: 'center' },
  barRight: { justifyContent: 'flex-end', paddingRight: 8 },
  barTitle: { flex: 1, alignItems: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 0, minHeight: 44, paddingRight: 6, maxWidth: 112 },
  backLabel: { flexShrink: 1, marginLeft: -2 },
  section: { marginTop: 32, gap: 14 },
  sectionHeader: { gap: 2, paddingHorizontal: GUTTER },
  sectionHeaderInset: { paddingHorizontal: GUTTER },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { flexShrink: 1 },
  // Puts the action's baseline on the baseline of the title's first line.
  sectionAction: { paddingTop: 5 },
});
