import { Platform } from 'react-native';
import { ReduceMotion, type WithSpringConfig } from 'react-native-reanimated';

import { tokens } from './tokens';

/**
 * The product theme on top of the design tokens: a near black canvas, quiet
 * monochrome surfaces with hairline borders, and one accent, the lumen aqua.
 * Values come from design/tokens.json; the surfaces between the token levels
 * are the same navy at a little more light.
 */
export const color = {
  canvas: tokens.color.background,
  canvasDeep: '#04070E',
  surface: '#0B111E',
  surfaceHigh: '#101828',
  surfacePressed: '#151F33',
  overlay: tokens.color.overlay,
  hairline: 'rgba(186, 214, 255, 0.09)',
  hairlineStrong: 'rgba(186, 214, 255, 0.15)',
  hairlineFocus: 'rgba(186, 214, 255, 0.26)',
  text: tokens.color.text,
  text2: tokens.color.textMuted,
  text3: '#7F8BA1',
  textDisabled: '#4A5568',
  accent: tokens.color.accent,
  accentPressed: '#2FD9C8',
  accentInk: tokens.color.onAccent,
  accentDeep: tokens.color.accentDeep,
  accentSoft: 'rgba(94, 242, 223, 0.10)',
  accentLine: 'rgba(94, 242, 223, 0.30)',
  success: tokens.color.success,
  warning: tokens.color.warning,
  danger: tokens.color.danger,
  info: tokens.color.info,
  neutral: '#8C97AB',
  scrim: 'rgba(2, 4, 9, 0.62)',
  white: '#FFFFFF',
} as const;

export type StatusTone = 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function statusColor(tone: StatusTone): string {
  return color[tone];
}

/** #RRGGBB at an opacity, as rgba(). */
export function alpha(hex: string, opacity: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

/** Font families loaded at start (src/ui/fonts.ts). */
export const family = {
  display: 'Sora_600SemiBold',
  displayRegular: 'Sora_400Regular',
  text: 'Inter_400Regular',
  textMedium: 'Inter_500Medium',
  textSemi: 'Inter_600SemiBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/** 8 point rhythm, with the 4 point half steps the tokens allow. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  huge: 56,
} as const;

/** Screen gutter, space.5 in the tokens. */
export const GUTTER = 20;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  sheet: 36,
  pill: 999,
} as const;

/** Bottom chrome: the tab bar and the floating command pill above it. */
export const chrome = {
  tabBar: 56,
  pill: 58,
  pillGap: 10,
  pillSide: 12,
} as const;

const spring = (name: keyof typeof springValues): WithSpringConfig => ({
  ...springValues[name],
  reduceMotion: ReduceMotion.System,
});

const springValues = {
  snap: { damping: 26, stiffness: 420, mass: 0.6 },
  press: { damping: 26, stiffness: 600, mass: 0.5 },
  glide: { damping: 22, stiffness: 180, mass: 1 },
  bloom: { damping: 17, stiffness: 140, mass: 1 },
  settle: { damping: 34, stiffness: 260, mass: 1 },
  drift: { damping: 20, stiffness: 90, mass: 1 },
} as const;

/** motion.spring.* from the tokens, ready for withSpring. */
export const springs = {
  snap: spring('snap'),
  press: spring('press'),
  glide: spring('glide'),
  bloom: spring('bloom'),
  settle: spring('settle'),
  drift: spring('drift'),
} as const;

export const durations = {
  instant: 90,
  quick: 140,
  base: 220,
  gentle: 320,
  slow: 480,
  breath: tokens.motion.breathMs,
} as const;

/** iOS continuous corners, ignored elsewhere. */
export const continuous = Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as const) : {};
