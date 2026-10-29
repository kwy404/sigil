import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '../ui/tokens';

export interface LevelRingProps {
  /** From 0 to 1, or null when the level cannot be read. */
  level: number | null;
  size: number;
  color: string;
  /** Read by screen readers, for example "Volume". */
  label: string;
  /** Shown in the middle, for example "40%". */
  valueText: string;
}

/**
 * A live level ring for the Control Sphere's quick actions: a track and an arc
 * that eases to the current level, drawn with Skia from the top, clockwise.
 * It jumps without easing when the system asks for reduced motion.
 */
export function LevelRing({ level, size, color, label, valueText }: LevelRingProps) {
  const reduceMotion = useReducedMotion();
  const stroke = Math.max(4, size * 0.09);
  const progress = useSharedValue(level ?? 0);

  useEffect(() => {
    const target = level ?? 0;
    progress.set(reduceMotion ? target : withTiming(target, { duration: 250 }));
  }, [level, reduceMotion, progress]);

  const arc = useMemo(
    () =>
      Skia.PathBuilder.Make()
        .addArc(Skia.XYWHRect(stroke / 2, stroke / 2, size - stroke, size - stroke), -90, 359.9)
        .detach(),
    [size, stroke],
  );

  return (
    <View
      style={{ width: size, height: size }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={level === null ? undefined : { min: 0, max: 100, now: Math.round(level * 100) }}>
      <Canvas style={{ width: size, height: size }}>
        <Circle cx={size / 2} cy={size / 2} r={(size - stroke) / 2} style="stroke" strokeWidth={stroke} color={tokens.color.border} />
        <Path path={arc} style="stroke" strokeWidth={stroke} strokeCap="round" color={color} start={0} end={progress} />
      </Canvas>
      <View style={styles.center}>
        <Text style={styles.value} numberOfLines={1}>
          {valueText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  value: { color: tokens.color.text, fontFamily: tokens.font.mono, fontSize: 13, fontWeight: '600' },
});
