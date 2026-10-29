import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glyph, type GlyphName } from './glyph';
import { PressableScale } from './press';
import { alpha, color, continuous, GUTTER, statusColor, type StatusTone } from './theme';
import { Txt, type TextTone } from './type';

/** A grouped list: one rounded surface with hairline separators, as in the system settings. */
export function ListGroup({
  header,
  footer,
  children,
  inset = 60,
  style,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
  /** Where the separators start, after the leading icon or artwork. */
  inset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[styles.group, style]}>
      {header ? (
        <Txt variant="monoTag" tone="tertiary" style={styles.header} accessibilityRole="header">
          {header}
        </Txt>
      ) : null}
      <View style={[styles.card, continuous]}>
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? <View style={[styles.separator, { marginLeft: inset }]} /> : null}
            {row}
          </Fragment>
        ))}
      </View>
      {footer ? (
        <Txt variant="footnote" tone="tertiary" style={styles.footer}>
          {footer}
        </Txt>
      ) : null}
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: GlyphName;
  /** Custom content on the left instead of the icon tile, such as artwork. */
  leading?: ReactNode;
  /** Color of the icon tile. */
  iconTone?: StatusTone;
  value?: string;
  valueTone?: TextTone;
  /** Show the value in the mono face (versions, packages, levels). */
  monoValue?: boolean;
  /** A status dot before the value. */
  status?: StatusTone;
  chevron?: boolean;
  /** External links show an arrow instead of a chevron. */
  external?: boolean;
  /** Title in the accent color, for actions such as Redo tutorial. */
  action?: boolean;
  loading?: boolean;
  disabled?: boolean;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function ListRow({
  title,
  subtitle,
  icon,
  leading,
  iconTone = 'neutral',
  value,
  valueTone = 'secondary',
  monoValue,
  status,
  chevron,
  external,
  action,
  loading,
  disabled,
  trailing,
  onPress,
  accessibilityHint,
}: ListRowProps) {
  const content = (
    <>
      {leading}
      {icon ? (
        <View style={[styles.iconTile, { backgroundColor: alpha(statusColor(iconTone), iconTone === 'neutral' ? 0.12 : 0.14) }]}>
          <Glyph name={icon} size={18} color={iconTone === 'neutral' ? color.text : statusColor(iconTone)} />
        </View>
      ) : null}
      <View style={styles.titles}>
        <Txt variant={action ? 'subhead' : 'callout'} tone={action ? 'accent' : 'primary'}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="footnote" tone="tertiary">
            {subtitle}
          </Txt>
        ) : null}
      </View>
      {value || status ? (
        <View style={styles.valueWrap}>
          {status ? <View style={[styles.dot, { backgroundColor: statusColor(status) }]} /> : null}
          {value ? (
            <Txt variant={monoValue ? 'mono' : 'callout'} tone={valueTone} numberOfLines={2} style={styles.value}>
              {value}
            </Txt>
          ) : null}
        </View>
      ) : null}
      {trailing}
      {loading ? <ActivityIndicator size="small" color={color.text3} /> : null}
      {chevron && !loading ? <Glyph name="chevron-right" size={18} color={color.text3} /> : null}
      {external && !loading ? <Glyph name="arrow-up-right" size={17} color={color.text3} /> : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}>
        {content}
      </View>
    );
  }
  return (
    <PressableScale
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      disabled={disabled || loading}
      onPress={onPress}
      feedback="highlight"
      pressedColor={color.surfacePressed}
      style={styles.row}>
      {content}
    </PressableScale>
  );
}

export function ListSwitchRow({
  title,
  subtitle,
  icon,
  iconTone,
  value,
  onValueChange,
}: {
  title: string;
  subtitle?: string;
  icon?: GlyphName;
  iconTone?: StatusTone;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      icon={icon}
      iconTone={iconTone}
      trailing={
        <Switch
          value={value}
          onValueChange={onValueChange}
          accessibilityLabel={title}
          trackColor={{ false: color.surfacePressed, true: color.accentDeep }}
          thumbColor={value ? color.accent : '#C9D3E2'}
          ios_backgroundColor={color.surfacePressed}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  group: { gap: 8, paddingHorizontal: GUTTER },
  header: { paddingHorizontal: 4, paddingBottom: 2 },
  footer: { paddingHorizontal: 4 },
  card: {
    backgroundColor: color.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  iconTile: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  titles: { flex: 1, gap: 2 },
  valueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '48%' },
  value: { textAlign: 'right', flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
