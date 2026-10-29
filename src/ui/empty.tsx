import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glyph, type GlyphName } from './glyph';
import { color, GUTTER } from './theme';
import { Txt } from './type';

/** A calm empty state: one glyph in a hairline ring, a title and one sentence. */
export function EmptyState({
  icon,
  title,
  body,
  style,
}: {
  icon: GlyphName;
  title: string;
  body: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, style]} accessible accessibilityLabel={`${title}. ${body}`}>
      <View style={styles.ring}>
        <Glyph name={icon} size={22} color={color.text2} />
      </View>
      <View style={styles.texts}>
        <Txt variant="headline">{title}</Txt>
        <Txt variant="footnote" tone="tertiary">
          {body}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    borderStyle: 'dashed',
  },
  ring: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  texts: { flex: 1, gap: 3 },
});
