import { StyleSheet, View } from 'react-native';

import { color } from '../../ui/theme';

const WEIGHTS = [0.45, 0.8, 1, 0.7, 0.5, 0.85, 0.6];

/** A small live meter of the microphone level, drawn as rounded bars. */
export function LevelBars({ level, height = 18, tint = color.info }: { level: number; height?: number; tint?: string }) {
  return (
    <View style={[styles.row, { height }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {WEIGHTS.map((weight, index) => {
        const value = Math.max(0.12, Math.min(1, level * weight * 1.25));
        return <View key={index} style={[styles.bar, { height: Math.round(height * value), backgroundColor: tint }]} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 3, borderRadius: 2 },
});
