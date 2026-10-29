import { Children, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { GUTTER } from './theme';

/**
 * A horizontal shelf of cards that snaps card by card, with the first card on
 * the screen gutter and the next one peeking in from the right edge.
 */
export function Shelf({ children, itemWidth, gap = 12 }: { children: ReactNode; itemWidth: number; gap?: number }) {
  const items = Children.toArray(children);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={itemWidth + gap}
      snapToAlignment="start"
      disableIntervalMomentum
      contentContainerStyle={[styles.content, { gap }]}>
      {items.map((child, index) => (
        <View key={index} style={{ width: itemWidth }}>
          {child}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
});
