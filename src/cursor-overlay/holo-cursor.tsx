import { BlurMask, Canvas, Circle, Group, RadialGradient, useClock, vec } from '@shopify/react-native-skia';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';

import { tokens, withAlpha } from '../ui/tokens';

export interface HoloCursorProps {
  /** Position inside the parent view, in points. */
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 0 with the fingers open, 1 while pinching. */
  press: SharedValue<number>;
  /** 0 hides the cursor, 1 shows it. */
  visible: SharedValue<number>;
  /** Multiplies the token sizes, for previews larger or smaller than the screen cursor. */
  scale?: number;
}

const PULSE_MS = 1400;
const C = tokens.cursor;
const HALO_COLORS = [withAlpha(tokens.color.accent, C.haloOpacity), withAlpha(tokens.color.accent, 0)];

/**
 * The in app holographic cursor: halo, pulse ring, glowing rim and a white hot
 * core, sized and colored from the light.cursor tokens and driven by shared
 * values so it follows the hand on the UI thread without React renders. The
 * cursor over other apps is the native CursorOverlay with the same metrics.
 * The pulse stops when the system asks for reduced motion.
 */
export function HoloCursor({ x, y, press, visible, scale = 1 }: HoloCursorProps) {
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const center = useDerivedValue(() => vec(x.get(), y.get()));
  const rim = useDerivedValue(() => C.ringRadius * scale * (1 - 0.3 * press.get()));
  const halo = useDerivedValue(() => C.haloRadius * scale * (1 - 0.2 * press.get()));
  // Light intensity goes from rest to pressed; opacity cannot pass 1, so the press also shrinks the rim.
  const glow = useDerivedValue(() =>
    Math.min(1, C.intensityRest + (C.intensityPressed - C.intensityRest) * press.get()),
  );
  const pulse = useDerivedValue(() => C.ringRadius * scale * (1 + ((clock.get() % PULSE_MS) / PULSE_MS) * 1.3));
  const pulseOpacity = useDerivedValue(() =>
    reduceMotion ? 0 : (1 - (clock.get() % PULSE_MS) / PULSE_MS) * 0.5 * (1 - press.get()),
  );
  const opacity = useDerivedValue(() => visible.get());

  return (
    <View style={styles.layer}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Group opacity={opacity}>
          <Circle c={center} r={halo}>
            <RadialGradient c={center} r={halo} colors={HALO_COLORS} />
          </Circle>
          <Circle
            c={center}
            r={pulse}
            style="stroke"
            strokeWidth={C.ringStroke}
            color={tokens.color.accent}
            opacity={pulseOpacity}
          />
          <Circle c={center} r={rim} style="stroke" strokeWidth={C.ringStroke * 1.5} color={tokens.color.accent} opacity={glow}>
            <BlurMask blur={C.glowBlur} style="solid" />
          </Circle>
          <Circle c={center} r={C.coreRadius * scale} color={tokens.color.accentBright} />
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, pointerEvents: 'none' },
});
