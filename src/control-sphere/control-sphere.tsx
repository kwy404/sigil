import { BlurMask, Canvas, Circle, Group, Path, RadialGradient, Skia, useClock, vec } from '@shopify/react-native-skia';
import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';

import { tokens } from '../ui/tokens';

export interface SphereSegment {
  id: string;
  label: string;
}

export type DefaultSegmentId = 'apps' | 'voice' | 'cursor' | 'profiles' | 'pause' | 'settings';

/** The hub's default ring of actions, with English labels; the screens pass translated ones. */
export const DEFAULT_SEGMENTS: readonly (SphereSegment & { id: DefaultSegmentId })[] = [
  { id: 'apps', label: 'Apps' },
  { id: 'voice', label: 'Voice' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'profiles', label: 'Profiles' },
  { id: 'pause', label: 'Pause' },
  { id: 'settings', label: 'Settings' },
];

export interface ControlSphereProps {
  size: number;
  segments?: readonly SphereSegment[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
  /** Drawn above the sphere, for example the holographic cursor. */
  children?: ReactNode;
}

const GAP_DEGREES = 7;

const BREATH_MS = tokens.motion.breathMs;
const ORBIT_MS = tokens.motion.ambientMs;

/**
 * The Control Sphere: Sigil's hub, opened with an open palm. A breathing core,
 * a slow orbit and one arc per action around it, in the lumen colors of the
 * design tokens. Segments are real buttons for touch and screen readers; with
 * gestures the user points at one and pinches. Breathing and orbit stop when
 * the system asks for reduced motion. Glass and particles come later.
 */
export function ControlSphere({ size, segments = DEFAULT_SEGMENTS, activeId, onSelect, children }: ControlSphereProps) {
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const c = size / 2;
  const coreRadius = size * 0.19;
  const ringRadius = size * 0.355;
  const orbitRadius = size * 0.47;
  const ringWidth = size * 0.11;

  const arcs = useMemo(() => {
    const sweep = 360 / Math.max(segments.length, 1);
    return segments.map((segment, i) => {
      const start = -90 + i * sweep + GAP_DEGREES / 2;
      const path = Skia.PathBuilder.Make()
        .addArc(Skia.XYWHRect(c - ringRadius, c - ringRadius, ringRadius * 2, ringRadius * 2), start, sweep - GAP_DEGREES)
        .detach();
      const middle = ((start + (sweep - GAP_DEGREES) / 2) * Math.PI) / 180;
      return {
        ...segment,
        path,
        labelX: c + Math.cos(middle) * ringRadius,
        labelY: c + Math.sin(middle) * ringRadius,
      };
    });
  }, [segments, c, ringRadius]);

  const orbit = useDerivedValue(() => [{ rotate: reduceMotion ? 0 : ((clock.get() % ORBIT_MS) / ORBIT_MS) * Math.PI * 2 }]);
  const core = useDerivedValue(() =>
    reduceMotion ? coreRadius : coreRadius * (1 + 0.035 * Math.sin((clock.get() / BREATH_MS) * Math.PI * 2)),
  );

  const accent = tokens.color.accent;

  return (
    <View style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        <Group origin={vec(c, c)} transform={orbit}>
          <Circle cx={c} cy={c} r={orbitRadius} style="stroke" strokeWidth={1} color={tokens.color.border} />
          <Circle cx={c + orbitRadius} cy={c} r={3} color={accent} />
          <Circle cx={c - orbitRadius} cy={c} r={2} color={tokens.color.accentDeep} />
        </Group>
        {arcs.map((arc) => (
          <Path
            key={arc.id}
            path={arc.path}
            style="stroke"
            strokeWidth={ringWidth}
            strokeCap="round"
            color={arc.id === activeId ? accent : tokens.color.accentSoft}
          />
        ))}
        <Circle cx={c} cy={c} r={core}>
          <RadialGradient
            c={vec(c - coreRadius * 0.35, c - coreRadius * 0.45)}
            r={coreRadius * 1.7}
            colors={[tokens.color.accentBright, accent, tokens.color.accentDeep, tokens.color.surface]}
            positions={[0, 0.25, 0.72, 1]}
          />
        </Circle>
        <Circle cx={c} cy={c} r={core} style="stroke" strokeWidth={2} color={`${accent}AA`}>
          <BlurMask blur={8} style="outer" />
        </Circle>
      </Canvas>
      {arcs.map((arc) => (
        <Pressable
          key={arc.id}
          accessibilityRole="button"
          accessibilityLabel={arc.label}
          accessibilityState={{ selected: arc.id === activeId }}
          onPress={() => onSelect?.(arc.id)}
          hitSlop={8}
          style={[styles.label, { left: arc.labelX - LABEL_WIDTH / 2, top: arc.labelY - LABEL_HEIGHT / 2 }]}>
          <Text style={[styles.labelText, arc.id === activeId ? styles.labelActive : null]} numberOfLines={1}>
            {arc.label}
          </Text>
        </Pressable>
      ))}
      {children}
    </View>
  );
}

const LABEL_WIDTH = 76;
const LABEL_HEIGHT = 24;

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    width: LABEL_WIDTH,
    height: LABEL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: { color: tokens.color.text, fontSize: 12, fontWeight: '600' },
  labelActive: { color: tokens.color.onAccent },
});
