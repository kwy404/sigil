import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { tokens, toneColor, type Tone } from './tokens';

export function Card({
  title,
  caption,
  right,
  children,
  style,
}: {
  title: string;
  caption?: string;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitles}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {title}
          </Text>
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Chip({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const color = toneColor(tone);
  return (
    <View style={[styles.chip, { borderColor: `${color}66`, backgroundColor: `${color}1A` }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = 'accent',
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  disabled?: boolean;
}) {
  const color = toneColor(tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { borderColor: color, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}>
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: Tone }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, tone ? { color: toneColor(tone) } : null]}>{value}</Text>
    </View>
  );
}

export const textStyles = StyleSheet.create({
  body: { color: tokens.color.text, fontSize: tokens.font.size.body, lineHeight: 21 },
  muted: { color: tokens.color.textMuted, fontSize: tokens.font.size.caption, lineHeight: 17 },
  mono: { color: tokens.color.text, fontFamily: tokens.font.mono, fontSize: 12 },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.md },
  cardTitles: { flex: 1, gap: 2 },
  cardTitle: { color: tokens.color.text, fontSize: tokens.font.size.title, fontWeight: '600' },
  caption: { color: tokens.color.textMuted, fontSize: tokens.font.size.caption, lineHeight: 17 },
  chip: {
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  chipText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  button: {
    borderWidth: 1,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.space.lg,
    paddingVertical: tokens.space.sm,
    alignItems: 'center',
  },
  buttonText: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.space.md },
  rowLabel: { color: tokens.color.textMuted, fontSize: 13, flexShrink: 1 },
  rowValue: { color: tokens.color.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },
});
