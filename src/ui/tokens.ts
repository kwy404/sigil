import { Platform } from 'react-native';

/**
 * Values from the SIGIL design tokens (design/tokens.json, dark theme), in the
 * shape the components use. Components read colors, spacing, radii and cursor
 * metrics only from here. Fonts (Sora, Inter, DM Mono), glass, trails and
 * particles are not wired in yet.
 */
export const tokens = {
  color: {
    /** theme.dark.bg */
    background: '#070B15',
    /** color.base.surface */
    surface: '#0B1120',
    /** color.base.raised */
    surfaceRaised: '#10182B',
    /** color.base.overlay */
    overlay: '#172238',
    /** color.line.default */
    border: 'rgba(186, 214, 255, 0.14)',
    /** theme.dark.text.primary */
    text: '#E8EEF6',
    /** theme.dark.text.secondary */
    textMuted: '#A7B3C6',
    /** theme.dark.text.onAccent */
    onAccent: '#032824',
    /** color.lumen.300, the signature glow */
    accent: '#5EF2DF',
    /** color.lumen.50, light.layer.core.color */
    accentBright: '#EFFFFC',
    /** color.lumen.500, light.layer.bloom.color */
    accentDeep: '#17B8AA',
    /** color.lumen.300 at 15 percent */
    accentSoft: '#5EF2DF26',
    /** theme.dark.state.* */
    success: '#8BE39B',
    warning: '#FFC46B',
    danger: '#FF7A86',
    info: '#8AB6FF',
  },
  /** space.1 to space.8 */
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  /** radius.sm to radius.xl and radius.full */
  radius: { sm: 10, md: 14, lg: 20, xl: 28, pill: 9999 },
  font: {
    mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    size: { caption: 12, body: 15, title: 20, hero: 34 },
  },
  /** light.cursor and light.intensity */
  cursor: {
    ringRadius: 14,
    ringStroke: 1.5,
    coreRadius: 3,
    haloRadius: 26,
    haloOpacity: 0.35,
    glowBlur: 4,
    intensityRest: 0.7,
    intensityPressed: 1.25,
  },
  /** motion.duration.breath and motion.duration.ambient */
  motion: { breathMs: 5200, ambientMs: 12000 },
} as const;

/** #RRGGBB plus an opacity from 0 to 1, as #RRGGBBAA. */
export function withAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex.slice(0, 7)}${alpha}`.toUpperCase();
}

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export function toneColor(tone: Tone): string {
  switch (tone) {
    case 'accent':
      return tokens.color.accent;
    case 'success':
      return tokens.color.success;
    case 'warning':
      return tokens.color.warning;
    case 'danger':
      return tokens.color.danger;
    case 'neutral':
      return tokens.color.textMuted;
  }
}
