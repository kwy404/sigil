import { BlurMask, Canvas, Circle, Group, RadialGradient, useClock, vec } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { tokens } from '../ui/tokens';

export interface HoloCursorProps {
  /** Position inside the parent view, in points. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 0 with the fingers open, 1 while pinching. */
  press: SharedValue<number>;
  /** 0 hides the cursor, 1 shows it. */
  visible: SharedValue<number>;
  radius?: number;
  /** Six digit hex color. */
  color?: string;
}

const PULSE_MS = 1400;

/**
 * The in app holographic cursor: halo, pulse ring, rim and core, all driven
 * by shared values so it follows the hand on the UI thread without React
 * renders. The cursor over other apps is the native CursorOverlay; both share
 * the same look so the hand off is not noticeable. Final effects come with the
 * design tokens.
 */
export function HoloCursor({ x, y, press, visible, radius = 18, color = tokens.color.accent }: HoloCursorProps) {
  const clock = useClock();
  const center = useDerivedValue(() => vec(x.get(), y.get()));
  const rim = useDerivedValue(() => radius * (1 - 0.35 * press.get()));
  const halo = useDerivedValue(() => radius * (2.4 - 0.6 * press.get()));
  const pulse = useDerivedValue(() => radius * (1 + ((clock.get() % PULSE_MS) / PULSE_MS) * 1.3));
  const pulseOpacity = useDerivedValue(() => (1 - (clock.get() % PULSE_MS) / PULSE_MS) * 0.55 * (1 - press.get()));
  const opacity = useDerivedValue(() => visible.get());

  return (
    <View style={styles.layer}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group opacity={opacity}>
          <Circle c={center} r={halo}>
            <RadialGradient c={center} r={halo} colors={[`${color}70`, `${color}00`]} />
          </Circle>
          <Circle c={center} r={pulse} style="stroke" strokeWidth={1.5} color={color} opacity={pulseOpacity} />
          <Circle c={center} r={rim} style="stroke" strokeWidth={2.5} color={color}>
            <BlurMask blur={2} style="solid" />
          </Circle>
          <Circle c={center} r={3.5} color="#FFFFFF" />
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none' },
});
