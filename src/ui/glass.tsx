import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { alpha, color } from './theme';

export interface GlassProps {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** Blur strength where the platform blurs (iOS and the web). */
  intensity?: number;
  /** Navy tint over the blur, from 0 to 1. */
  tint?: number;
  /** Opacity of the solid surface where there is no live blur (Android). */
  solid?: number;
}

const BLURS = Platform.OS === 'ios' || Platform.OS === 'web';

/**
 * A glass surface for the chrome: the tab bar, the command pill and compact
 * headers. iOS and the web blur what is behind it; Android uses the solid
 * fallback the design system defines (the canvas at high opacity), which
 * stays smooth on mid range phones while lists scroll under it.
 */
export function Glass({ style, children, intensity = 70, tint = 0.62, solid = 0.94 }: GlassProps) {
  if (!BLURS) {
    return <View style={[{ backgroundColor: alpha(color.canvas, solid) }, style]}>{children}</View>;
  }
  return (
    <View style={[styles.clip, style]}>
      <BlurView intensity={intensity} tint="systemChromeMaterialDark" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(color.canvas, tint) }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
