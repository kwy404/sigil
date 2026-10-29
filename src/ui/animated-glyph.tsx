import { BlurMask, Canvas, Group, Path, Skia, useClock } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';

import { Glyph, glyphPaths, type GlyphName } from './glyph';
import { useSkiaReady } from './skia-ready';
import { color } from './theme';

const CYCLE_MS = 3600;
const DRAW_MS = 1500;
const STAGGER_MS = 160;

/**
 * A glyph that draws itself like a light trail ending at a fingertip, holds,
 * then dims and draws again. Static with reduced motion.
 */
export function AnimatedGlyph({ name, size, ink = color.accent }: { name: GlyphName; size: number; ink?: string }) {
  const skia = useSkiaReady();
  if (!skia) {
    return (
      <View style={{ width: size, height: size }}>
        <Glyph name={name} size={size} color={ink} stroke={2.4} />
      </View>
    );
  }
  return <DrawnGlyph name={name} size={size} ink={ink} />;
}

function DrawnGlyph({ name, size, ink }: { name: GlyphName; size: number; ink: string }) {
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const parts = useMemo(
    () =>
      glyphPaths(name)
        .map((part) => ({ ...part, path: Skia.Path.MakeFromSVGString(part.d) }))
        .filter((part) => part.path !== null),
    [name],
  );
  const scale = size / 24;
  const stroke = Math.max(1, (2.4 * 24) / size);

  const time = useDerivedValue(() => (reduceMotion ? DRAW_MS * 4 : clock.get() % CYCLE_MS));
  const fade = useDerivedValue(() => {
    const t = time.get();
    if (reduceMotion) return 1;
    if (t > CYCLE_MS - 420) return Math.max(0.25, 1 - (t - (CYCLE_MS - 420)) / 420);
    return 1;
  });

  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale }]} opacity={fade}>
        {parts.map((part, index) => (
          <GlyphPart key={index} index={index} part={part} time={time} ink={ink} stroke={stroke} />
        ))}
      </Group>
    </Canvas>
  );
}

function GlyphPart({
  index,
  part,
  time,
  ink,
  stroke,
}: {
  index: number;
  part: { path: ReturnType<typeof Skia.Path.MakeFromSVGString>; secondary: boolean; fill: boolean };
  time: ReturnType<typeof useDerivedValue<number>>;
  ink: string;
  stroke: number;
}) {
  const end = useDerivedValue(() => {
    const local = (time.get() - index * STAGGER_MS) / DRAW_MS;
    return Math.min(1, Math.max(0, 1 - (1 - local) * (1 - local) * (local < 0 ? 0 : 1) - (local < 0 ? 1 : 0)));
  });
  const shown = useDerivedValue(() => (end.get() > 0.98 ? 1 : 0));
  if (!part.path) return null;
  if (part.secondary || part.fill) {
    return <Path path={part.path} color={ink} opacity={part.secondary ? shown.get() * 0.28 : shown.get()} />;
  }
  return (
    <>
      <Path path={part.path} style="stroke" strokeWidth={stroke * 2.4} strokeCap="round" strokeJoin="round" color={ink} opacity={0.32} end={end}>
        <BlurMask blur={stroke * 1.6} style="normal" />
      </Path>
      <Path path={part.path} style="stroke" strokeWidth={stroke} strokeCap="round" strokeJoin="round" color={ink} end={end} />
    </>
  );
}
