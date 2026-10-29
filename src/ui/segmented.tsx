import { ScrollView, StyleSheet } from 'react-native';

import { PressableScale } from './press';
import { color, GUTTER } from './theme';
import { Txt } from './type';

/** A row of filter pills; it scrolls when the labels are long. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <PressableScale
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            scaleTo={0.95}
            style={[styles.pill, selected ? styles.selected : null]}>
            <Txt variant="buttonSmall" tone={selected ? 'primary' : 'tertiary'} numberOfLines={1}>
              {option.label}
            </Txt>
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: GUTTER, gap: 8 },
  pill: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
  },
  selected: { backgroundColor: color.surfaceHigh, borderColor: color.hairlineFocus },
});
