import { useId } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Pattern, RadialGradient, Rect, Stop } from 'react-native-svg';

import { color } from './theme';

function svgId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * A hairline grid that fades out toward the edges, as on technical pages.
 * Drawn once as a vector pattern; it never animates.
 */
export function GridBackdrop({
  cell = 24,
  opacity = 0.06,
  fadeTo = color.canvas,
  center = { x: 0.5, y: 0.35 },
  style,
}: {
  cell?: number;
  opacity?: number;
  /** The color the grid fades into at the edges, usually what is under it. */
  fadeTo?: string;
  center?: { x: number; y: number };
  style?: StyleProp<ViewStyle>;
}) {
  const id = svgId(useId());
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id={`g${id}`} width={cell} height={cell} patternUnits="userSpaceOnUse">
            <Path d={`M${cell} 0H0V${cell}`} stroke="#BAD6FF" strokeOpacity={opacity} strokeWidth={1} fill="none" />
          </Pattern>
          <RadialGradient id={`f${id}`} cx={`${center.x * 100}%`} cy={`${center.y * 100}%`} r="75%">
            <Stop offset="0" stopColor={fadeTo} stopOpacity={0} />
            <Stop offset="0.55" stopColor={fadeTo} stopOpacity={0.35} />
            <Stop offset="1" stopColor={fadeTo} stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#g${id})`} />
        <Rect width="100%" height="100%" fill={`url(#f${id})`} />
      </Svg>
    </View>
  );
}

/** A soft radial light, the one gradient accent of a surface. */
export function Glow({
  x,
  y,
  radius,
  tint = color.accent,
  opacity = 0.16,
  style,
}: {
  /** Center in points from the top left of the parent. */
  x: number;
  y: number;
  radius: number;
  tint?: string;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const id = svgId(useId());
  return (
    <View
      pointerEvents="none"
      style={[{ position: 'absolute', left: x - radius, top: y - radius, width: radius * 2, height: radius * 2 }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={`r${id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity={opacity} />
            <Stop offset="0.45" stopColor={tint} stopOpacity={opacity * 0.42} />
            <Stop offset="1" stopColor={tint} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#r${id})`} />
      </Svg>
    </View>
  );
}

/**
 * A vertical fade to the canvas, so content dims as it scrolls under the
 * floating chrome instead of showing at full strength around the pill.
 */
export function Fade({ to = color.canvas, strength = 0.92, style }: { to?: string; strength?: number; style?: StyleProp<ViewStyle> }) {
  const id = svgId(useId());
  return (
    <View pointerEvents="none" style={style}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={to} stopOpacity={0} />
            <Stop offset="0.55" stopColor={to} stopOpacity={strength * 0.72} />
            <Stop offset="1" stopColor={to} stopOpacity={strength} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#f${id})`} />
      </Svg>
    </View>
  );
}
