import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glyph, type GlyphName } from './glyph';
import { PressableScale } from './press';
import { color, continuous, radius } from './theme';
import { Txt, type TextTone } from './type';

export type ButtonVariant = 'primary' | 'secondary' | 'tinted' | 'ghost';
export type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: GlyphName;
  /** Icon after the label, for chevrons. */
  trailingIcon?: GlyphName;
  disabled?: boolean;
  loading?: boolean;
  /** Stretch to the width of the parent. */
  block?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { lg: 52, md: 42, sm: 34 };
const PAD: Record<ButtonSize, number> = { lg: 22, md: 18, sm: 14 };
const ICON: Record<ButtonSize, number> = { lg: 20, md: 18, sm: 16 };

const LOOK: Record<ButtonVariant, { bg: string; border: string; fg: string; tone: TextTone }> = {
  primary: { bg: color.accent, border: color.accent, fg: color.accentInk, tone: 'inverse' },
  secondary: { bg: color.surfaceHigh, border: color.hairlineStrong, fg: color.text, tone: 'primary' },
  tinted: { bg: color.accentSoft, border: color.accentLine, fg: color.accent, tone: 'accent' },
  ghost: { bg: 'transparent', border: 'transparent', fg: color.accent, tone: 'accent' },
};

/** Pill buttons: one accent fill for the main action, quiet surfaces for the rest. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  disabled,
  loading,
  block,
  accessibilityLabel,
  accessibilityHint,
  style,
}: ButtonProps) {
  const look = LOOK[variant];
  const inactive = disabled === true || loading === true;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading === true }}
      disabled={inactive}
      haptics={variant === 'primary' ? 'press' : 'selection'}
      onPress={onPress}
      hitSlop={size === 'sm' ? 8 : 4}
      style={[
        styles.base,
        continuous,
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: PAD[size],
          backgroundColor: look.bg,
          borderColor: look.border,
        },
        block ? styles.block : null,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={look.fg} />
      ) : icon ? (
        <Glyph name={icon} size={ICON[size]} color={look.fg} />
      ) : null}
      <Txt variant={size === 'sm' ? 'buttonSmall' : 'button'} tone={look.tone} numberOfLines={2} align="center" style={styles.label}>
        {label}
      </Txt>
      {trailingIcon ? (
        <View style={styles.trailing}>
          <Glyph name={trailingIcon} size={ICON[size] - 2} color={look.fg} />
        </View>
      ) : null}
    </PressableScale>
  );
}

/** A round icon button: transport controls, close and the mic. */
export function IconButton({
  icon,
  label,
  onPress,
  size = 44,
  iconSize,
  variant = 'secondary',
  disabled,
  active,
  style,
}: {
  icon: GlyphName;
  label: string;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  variant?: ButtonVariant | 'plain';
  disabled?: boolean;
  /** Pressed in state, for toggles like the mic. */
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const look = variant === 'plain' ? { bg: 'transparent', border: 'transparent', fg: color.text } : LOOK[variant];
  const fg = active ? color.accentInk : look.fg;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active === true }}
      disabled={disabled}
      haptics="press"
      scaleTo={0.9}
      hitSlop={Math.max(0, (48 - size) / 2)}
      onPress={onPress}
      style={[
        styles.round,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: active ? color.accent : look.bg,
          borderColor: active ? color.accent : look.border,
        },
        style,
      ]}>
      <Glyph name={icon} size={iconSize ?? Math.round(size * 0.46)} color={fg} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  block: { alignSelf: 'stretch' },
  label: { flexShrink: 1 },
  trailing: { marginRight: -4 },
  round: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
