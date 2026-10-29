import { BlurMask, Canvas, Circle, Group, LinearGradient, Path, RadialGradient, Skia, useClock, vec } from '@shopify/react-native-skia';
import { View } from 'react-native';
import { useDerivedValue, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';

import { useSkiaReady } from './skia-ready';
import { color } from './theme';

export type MarkState = 'off' | 'idle' | 'active' | 'listening' | 'thinking';

const TOP = 'M15.99 4.81A4.7 4.7 0 0 0 7.85 9.51';
const BOTTOM = 'M8.01 19.19A4.7 4.7 0 0 0 16.15 14.49';

const BREATH_MS = 5200;
const THINK_MS = 1600;
const MOTE_MS = 26000;

/** The layers of a light from the tokens: core, glow, bloom, ambient. */
const LUMEN = {
  core: '#EFFFFC',
  edge: '#98FBEA',
  glow: '#5EF2DF',
  ambient: '#2FD9C8',
  bloom: '#17B8AA',
};

let cached: { top: ReturnType<typeof Skia.Path.MakeFromSVGString>; bottom: ReturnType<typeof Skia.Path.MakeFromSVGString> } | null =
  null;

function markPaths() {
  if (!cached) {
    cached = { top: Skia.Path.MakeFromSVGString(TOP), bottom: Skia.Path.MakeFromSVGString(BOTTOM) };
  }
  return cached;
}

function StaticMark({ size, dim }: { size: number; dim: boolean }) {
  const ink = dim ? '#C9D3E2' : color.text;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <SvgPath d={TOP} stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none" />
      <SvgPath d={BOTTOM} stroke={ink} strokeWidth={2} strokeLinecap="round" fill="none" />
      <SvgCircle cx={12} cy={12} r={2} fill={color.accent} />
    </Svg>
  );
}

/**
 * The luminous mark: an S drawn in two strokes around a point of light. It
 * breathes at rest, glows brighter while Sigil tracks, opens with the voice
 * while listening and orbits while thinking. Static with reduced motion, and
 * a flat vector until Skia is ready on the web.
 */
export function SigilMark({
  size,
  state = 'idle',
  level = 0,
  motes = true,
}: {
  size: number;
  state?: MarkState;
  /** Voice level from 0 to 1, while listening. */
  level?: number;
  motes?: boolean;
}) {
  const skia = useSkiaReady();
  if (!skia) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <StaticMark size={size * 0.62} dim={state === 'off'} />
      </View>
    );
  }
  return <SkiaMark size={size} state={state} level={level} motes={motes} />;
}

type MarkProps = { size: number; state: MarkState; level: number; motes: boolean };

function SkiaMark(props: MarkProps) {
  const reduceMotion = useReducedMotion();
  // A mark that cannot move draws once instead of on every frame.
  return props.state === 'off' || reduceMotion ? <StillMark {...props} /> : <MovingMark {...props} />;
}

function MovingMark(props: MarkProps) {
  const clock = useClock();
  return <LuminousMark {...props} clock={clock} />;
}

function StillMark(props: MarkProps) {
  const clock = useSharedValue(0);
  return <LuminousMark {...props} clock={clock} />;
}

function LuminousMark({ size, state, level, motes, clock }: MarkProps & { clock: SharedValue<number> }) {
  const reduceMotion = useReducedMotion();
  const { top, bottom } = markPaths();
  // The mark spans 62 percent of the canvas; the rest is room for the light.
  const unit = (size * 0.62) / 24;
  const origin = (size - 24 * unit) / 2;
  const center = size / 2;
  const off = state === 'off';
  const intensity = off ? 0.42 : state === 'active' || state === 'listening' ? 1 : 0.8;

  const glowOpacity = useDerivedValue(() => {
    if (reduceMotion || off) return intensity;
    const wave = 0.5 + 0.5 * Math.sin((clock.get() / BREATH_MS) * Math.PI * 2);
    return intensity * (0.82 + 0.18 * wave);
  });
  const arcs = useDerivedValue(() => {
    const breath = reduceMotion || off ? 1 : 1 + 0.015 * Math.sin((clock.get() / BREATH_MS) * Math.PI * 2);
    const spin = state === 'thinking' && !reduceMotion ? ((clock.get() % THINK_MS) / THINK_MS) * Math.PI * 2 : 0;
    const open = state === 'listening' ? 1.03 + 0.08 * Math.min(1, Math.max(0, level)) : 1;
    return [{ rotate: spin }, { scale: open * breath }];
  });
  const orbit = useDerivedValue(() => [{ rotate: reduceMotion ? 0 : ((clock.get() % MOTE_MS) / MOTE_MS) * Math.PI * 2 }]);

  const mapping = [{ translateX: origin }, { translateY: origin }, { scale: unit }];
  const arcColors = off ? ['#9AA6B8', '#D5DDE8', '#E8EEF6'] : [LUMEN.bloom, LUMEN.edge, LUMEN.core];
  const arcStops = [0, 0.55, 1];

  return (
    <Canvas style={{ width: size, height: size }}>
      <Circle cx={center} cy={center} r={center} opacity={glowOpacity}>
        <RadialGradient
          c={vec(center, center)}
          r={center}
          colors={[off ? '#2FD9C80C' : '#2FD9C840', off ? '#17B8AA06' : '#17B8AA14', '#17B8AA00']}
          positions={[0, 0.45, 1]}
        />
      </Circle>
      {motes && !off ? (
        <Group origin={vec(center, center)} transform={orbit} opacity={0.75}>
          <Circle cx={center + size * 0.41} cy={center} r={Math.max(1, size * 0.008)} color={LUMEN.edge} />
          <Circle cx={center - size * 0.3} cy={center - size * 0.29} r={Math.max(0.8, size * 0.006)} color={LUMEN.glow} />
          <Circle cx={center - size * 0.12} cy={center + size * 0.4} r={Math.max(0.8, size * 0.005)} color={LUMEN.edge} />
          <Circle cx={center + size * 0.24} cy={center - size * 0.35} r={Math.max(0.7, size * 0.004)} color={LUMEN.glow} />
        </Group>
      ) : null}
      {top && bottom ? (
        <Group origin={vec(center, center)} transform={arcs}>
          <Group transform={mapping}>
            {off ? null : (
              <Group opacity={glowOpacity}>
                <Path path={top} style="stroke" strokeWidth={3.2} strokeCap="round" color={LUMEN.bloom}>
                  <BlurMask blur={2.6} style="normal" />
                </Path>
                <Path path={bottom} style="stroke" strokeWidth={3.2} strokeCap="round" color={LUMEN.bloom}>
                  <BlurMask blur={2.6} style="normal" />
                </Path>
              </Group>
            )}
            <Path path={top} style="stroke" strokeWidth={2} strokeCap="round">
              <LinearGradient start={vec(15.99, 4.81)} end={vec(7.85, 9.51)} colors={arcColors} positions={arcStops} />
            </Path>
            <Path path={bottom} style="stroke" strokeWidth={2} strokeCap="round">
              <LinearGradient start={vec(8.01, 19.19)} end={vec(16.15, 14.49)} colors={arcColors} positions={arcStops} />
            </Path>
          </Group>
        </Group>
      ) : null}
      <Circle cx={center} cy={center} r={4.8 * unit} opacity={glowOpacity}>
        <RadialGradient
          c={vec(center, center)}
          r={4.8 * unit}
          colors={off ? ['#5EF2DF66', '#5EF2DF14', '#5EF2DF00'] : ['#5EF2DFCC', '#5EF2DF33', '#5EF2DF00']}
        />
      </Circle>
      <Circle cx={center} cy={center} r={2 * unit}>
        <RadialGradient
          c={vec(center - 0.4 * unit, center - 0.5 * unit)}
          r={2.4 * unit}
          colors={off ? [LUMEN.edge, LUMEN.glow, LUMEN.ambient] : ['#FFFFFF', LUMEN.core, LUMEN.glow]}
          positions={[0, 0.35, 1]}
        />
      </Circle>
    </Canvas>
  );
}
