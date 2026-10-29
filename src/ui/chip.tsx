import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Glyph, type GlyphName } from './glyph';
import { alpha, color, statusColor, type StatusTone } from './theme';
import { Txt } from './type';

/** A status dot that breathes while something is live (tracking, listening). */
export function StatusDot({ tone, live = false, size = 7 }: { tone: StatusTone; live?: boolean; size?: number }) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  const hue = statusColor(tone);

  useEffect(() => {
    if (live && !reduceMotion) {
      pulse.set(withRepeat(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), -1, false));
    } else {
      cancelAnimation(pulse);
      pulse.set(0);
    }
    return () => cancelAnimation(pulse);
  }, [live, reduceMotion, pulse]);

  const ring = useAnimatedStyle(() => ({
    opacity: live ? 0.55 * (1 - pulse.get()) : 0,
    transform: [{ scale: 1 + 1.6 * pulse.get() }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { borderRadius: size, backgroundColor: hue }, ring]}
        pointerEvents="none"
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: hue }} />
    </View>
  );
}

/**
 * A status chip in the deployment style: a colored dot and a mono label.
 * The color is never the only signal; the label always says the state.
 */
export function StatusChip({
  tone,
  label,
  live,
  style,
}: {
  tone: StatusTone;
  label: string;
  live?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.chip, { backgroundColor: alpha(statusColor(tone), 0.08), borderColor: alpha(statusColor(tone), 0.24) }, style]}
      accessible
      accessibilityLabel={label}>
      <StatusDot tone={tone} live={live} size={6} />
      <Txt variant="monoTag" tone="secondary" numberOfLines={1} style={styles.label}>
        {label}
      </Txt>
    </View>
  );
}

/** A quiet mono tag for technical facts: ON DEVICE, DRY RUN, 13 GESTURES. */
export function Tag({ label, icon, accent, style }: { label: string; icon?: GlyphName; accent?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tag, accent ? styles.tagAccent : null, style]}>
      {icon ? <Glyph name={icon} size={13} color={accent ? color.accent : color.text2} /> : null}
      <Txt variant="monoTag" tone={accent ? 'accent' : 'secondary'} numberOfLines={1} style={styles.label}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    minHeight: 26,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    minHeight: 24,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    backgroundColor: color.surface,
  },
  tagAccent: { borderColor: color.accentLine, backgroundColor: color.accentSoft },
  label: { flexShrink: 1 },
});
