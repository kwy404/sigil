import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { useI18n } from '../i18n';
import { color, family } from './theme';

/**
 * The type scale. Sora carries titles (never below 17), Inter carries text,
 * DM Mono carries technical facts and live numbers. Chinese and Japanese use
 * the system face with real weights, since the brand fonts have no CJK glyphs
 * and a fallback would drop to a regular weight.
 */
export type TypeVariant =
  | 'hero'
  | 'largeTitle'
  | 'title1'
  | 'title2'
  | 'title3'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'button'
  | 'buttonSmall'
  | 'tab'
  | 'mono'
  | 'monoTag'
  | 'monoValue'
  | 'stat';

type Spec = { latin: TextStyle; cjk: TextStyle };

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

const SPECS: Record<TypeVariant, Spec> = {
  hero: {
    latin: { fontFamily: family.display, fontSize: 40, lineHeight: 46, letterSpacing: -1.2 },
    cjk: { fontWeight: '700', fontSize: 34, lineHeight: 44 },
  },
  largeTitle: {
    latin: { fontFamily: family.display, fontSize: 34, lineHeight: 40, letterSpacing: -0.9 },
    cjk: { fontWeight: '700', fontSize: 31, lineHeight: 40 },
  },
  title1: {
    latin: { fontFamily: family.display, fontSize: 28, lineHeight: 34, letterSpacing: -0.6 },
    cjk: { fontWeight: '700', fontSize: 25, lineHeight: 34 },
  },
  title2: {
    latin: { fontFamily: family.display, fontSize: 21, lineHeight: 27, letterSpacing: -0.35 },
    cjk: { fontWeight: '700', fontSize: 20, lineHeight: 27 },
  },
  title3: {
    latin: { fontFamily: family.display, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
    cjk: { fontWeight: '700', fontSize: 17, lineHeight: 24 },
  },
  headline: {
    latin: { fontFamily: family.textSemi, fontSize: 16, lineHeight: 22, letterSpacing: -0.15 },
    cjk: { fontWeight: '600', fontSize: 16, lineHeight: 22 },
  },
  body: {
    latin: { fontFamily: family.text, fontSize: 16, lineHeight: 24, letterSpacing: -0.1 },
    cjk: { fontSize: 16, lineHeight: 25 },
  },
  callout: {
    latin: { fontFamily: family.text, fontSize: 15, lineHeight: 22 },
    cjk: { fontSize: 15, lineHeight: 23 },
  },
  subhead: {
    latin: { fontFamily: family.textMedium, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
    cjk: { fontWeight: '500', fontSize: 15, lineHeight: 21 },
  },
  footnote: {
    latin: { fontFamily: family.text, fontSize: 13, lineHeight: 18 },
    cjk: { fontSize: 13, lineHeight: 19 },
  },
  caption: {
    latin: { fontFamily: family.textMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
    cjk: { fontWeight: '500', fontSize: 12, lineHeight: 17 },
  },
  button: {
    latin: { fontFamily: family.textSemi, fontSize: 16, lineHeight: 20, letterSpacing: -0.15 },
    cjk: { fontWeight: '600', fontSize: 16, lineHeight: 21 },
  },
  buttonSmall: {
    latin: { fontFamily: family.textSemi, fontSize: 14, lineHeight: 18 },
    cjk: { fontWeight: '600', fontSize: 14, lineHeight: 19 },
  },
  tab: {
    latin: { fontFamily: family.textMedium, fontSize: 10.5, lineHeight: 13, letterSpacing: 0.1 },
    cjk: { fontWeight: '500', fontSize: 10.5, lineHeight: 13 },
  },
  mono: {
    latin: { fontFamily: family.mono, fontSize: 13, lineHeight: 18, ...tabular },
    cjk: { fontFamily: family.mono, fontSize: 13, lineHeight: 19, ...tabular },
  },
  monoTag: {
    latin: { fontFamily: family.monoMedium, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },
    cjk: { fontFamily: family.monoMedium, fontSize: 11, lineHeight: 15, letterSpacing: 0.4, textTransform: 'uppercase' },
  },
  monoValue: {
    latin: { fontFamily: family.mono, fontSize: 15, lineHeight: 20, ...tabular },
    cjk: { fontFamily: family.mono, fontSize: 15, lineHeight: 20, ...tabular },
  },
  stat: {
    latin: { fontFamily: family.monoMedium, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, ...tabular },
    cjk: { fontFamily: family.monoMedium, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, ...tabular },
  },
};

const LATIN = StyleSheet.create(
  Object.fromEntries(Object.entries(SPECS).map(([key, spec]) => [key, spec.latin])) as Record<TypeVariant, TextStyle>,
);
const CJK = StyleSheet.create(
  Object.fromEntries(Object.entries(SPECS).map(([key, spec]) => [key, spec.cjk])) as Record<TypeVariant, TextStyle>,
);

/** HUD tags reflow instead of growing past 140 percent; everything else follows the system up to 200 percent. */
const MAX_SCALE: Partial<Record<TypeVariant, number>> = { monoTag: 1.4, tab: 1.3 };

export function isCjk(language: string): boolean {
  return language === 'ja' || language === 'zh-CN';
}

/** The style of one variant in the current language. */
export function useTypeStyle(variant: TypeVariant): TextStyle {
  const { language } = useI18n();
  return (isCjk(language) ? CJK : LATIN)[variant];
}

export type TextTone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'inverse' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<TextTone, string> = {
  primary: color.text,
  secondary: color.text2,
  tertiary: color.text3,
  accent: color.accent,
  inverse: color.accentInk,
  success: color.success,
  warning: color.warning,
  danger: color.danger,
  info: color.info,
};

export interface TxtProps extends TextProps {
  variant?: TypeVariant;
  tone?: TextTone;
  align?: TextStyle['textAlign'];
}

export function Txt({ variant = 'body', tone = 'primary', align, style, maxFontSizeMultiplier, ...rest }: TxtProps) {
  const base = useTypeStyle(variant);
  return (
    <Text
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_SCALE[variant] ?? 2}
      style={[base, { color: TONES[tone] }, align ? { textAlign: align } : null, style]}
      {...rest}
    />
  );
}
