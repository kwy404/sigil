import { Platform } from 'react-native';

/**
 * Placeholder tokens for the first screens. The design system replaces these
 * values; components read colors, spacing and radii only from here so the
 * swap touches one file.
 */
export const tokens = {
  color: {
    background: '#05070D',
    surface: '#0B1020',
    surfaceRaised: '#111933',
    border: '#1E2A47',
    text: '#E8F1FF',
    textMuted: '#8EA0C2',
    accent: '#5CE1E6',
    accentSoft: '#5CE1E626',
    violet: '#8B5CF6',
    success: '#4ADE80',
    warning: '#FBBF24',
    danger: '#F87171',
  },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 8, md: 14, lg: 22, pill: 999 },
  font: {
    mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    size: { caption: 12, body: 15, title: 20, hero: 34 },
  },
} as const;

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
