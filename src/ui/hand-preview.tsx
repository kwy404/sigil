import { BlurMask, Canvas, Group, Path, useClock, usePathValue } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useReducedMotion } from 'react-native-reanimated';
import Svg, { Circle as SvgCircle, Line } from 'react-native-svg';

import { FINGERTIPS, HAND_BONES, handClip, type ClipId } from '../catalog/performances';
import { useSkiaReady } from './skia-ready';
import { color } from './theme';

const LOOP_PAUSE_MS = 700;
const TRAIL_FRAMES = 9;

export interface HandPreviewProps {
  clip: ClipId;
  width: number;
  height: number;
  /** Bright lumen while Sigil sees the hand, quiet gray otherwise. */
  live?: boolean;
  /** Stop on one telling frame. */
  still?: boolean;
}

/** The frame that shows a clip best when it cannot move: the middle of its first pinch, or its middle. */
function stillFrame(clipId: ClipId): number {
  const clip = handClip(clipId);
  const first = clip.pinch.indexOf(1);
  if (first >= 0) {
    let last = first;
    while (last + 1 < clip.pinch.length && clip.pinch[last + 1] === 1) last++;
    return Math.floor((first + last) / 2);
  }
  for (let i = Math.floor(clip.frameCount * 0.6); i < clip.frameCount; i++) {
    if (!Number.isNaN(clip.points[i * 42])) return i;
  }
  return 0;
}

/**
 * A hand drawn from its 21 landmarks, the way Sigil sees it: bones of light,
 * bright fingertips, a trail on moving signs and a ring on every pinch.
 */
export function HandPreview(props: HandPreviewProps) {
  const skia = useSkiaReady();
  return skia ? <LiveHand {...props} /> : <FlatHand {...props} />;
}

function FlatHand({ clip: clipId, width, height, live = true }: HandPreviewProps) {
  const clip = handClip(clipId);
  const frame = stillFrame(clipId);
  const side = Math.min(width, height);
  const ox = (width - side) / 2;
  const oy = (height - side) / 2;
  const at = (i: number) => ({ x: ox + clip.points[frame * 42 + i * 2] * side, y: oy + clip.points[frame * 42 + i * 2 + 1] * side });
  const ink = live ? color.accent : color.text3;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {HAND_BONES.map(([a, b], index) => {
          const p = at(a);
          const q = at(b);
          return <Line key={index} x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={ink} strokeOpacity={0.8} strokeWidth={2} strokeLinecap="round" />;
        })}
        {FINGERTIPS.map((tip) => {
          const p = at(tip);
          return <SvgCircle key={tip} cx={p.x} cy={p.y} r={3.4} fill={live ? '#EFFFFC' : color.text2} />;
        })}
      </Svg>
    </View>
  );
}

function LiveHand({ clip: clipId, width, height, live = true, still = false }: HandPreviewProps) {
  const reduceMotion = useReducedMotion();
  const clock = useClock();
  const clip = handClip(clipId);
  const fixedFrame = useMemo(() => stillFrame(clipId), [clipId]);
  const { points, pinch, frameCount, fps, trailTip } = clip;
  const step = 1000 / fps;
  const loop = frameCount * step + LOOP_PAUSE_MS;
  const frozen = still || reduceMotion;
  const side = Math.min(width, height);
  const ox = (width - side) / 2;
  const oy = (height - side) / 2;

  const frame = useDerivedValue(() => {
    if (frozen) return fixedFrame;
    const t = clock.get() % loop;
    return Math.min(frameCount - 1, Math.floor(t / step));
  });

  const bones = usePathValue((builder) => {
    'worklet';
    const base = frame.get() * 42;
    if (Number.isNaN(points[base])) return;
    for (let i = 0; i < HAND_BONES.length; i++) {
      const a = HAND_BONES[i][0];
      const b = HAND_BONES[i][1];
      builder.moveTo(ox + points[base + a * 2] * side, oy + points[base + a * 2 + 1] * side);
      builder.lineTo(ox + points[base + b * 2] * side, oy + points[base + b * 2 + 1] * side);
    }
  });

  const joints = usePathValue((builder) => {
    'worklet';
    const base = frame.get() * 42;
    if (Number.isNaN(points[base])) return;
    for (let i = 0; i < 21; i++) {
      const tip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      builder.addCircle(ox + points[base + i * 2] * side, oy + points[base + i * 2 + 1] * side, tip ? 3.6 : 2.2);
    }
  });

  const trail = usePathValue((builder) => {
    'worklet';
    if (trailTip < 0) return;
    const current = frame.get();
    let started = false;
    for (let f = Math.max(0, current - TRAIL_FRAMES); f <= current; f++) {
      const x = points[f * 42 + trailTip * 2];
      const y = points[f * 42 + trailTip * 2 + 1];
      if (Number.isNaN(x)) {
        started = false;
        continue;
      }
      if (!started) {
        builder.moveTo(ox + x * side, oy + y * side);
        started = true;
      } else {
        builder.lineTo(ox + x * side, oy + y * side);
      }
    }
  });

  const ring = usePathValue((builder) => {
    'worklet';
    const current = frame.get();
    if (pinch[current] !== 1) return;
    const base = current * 42;
    const x = (points[base + 8] + points[base + 16]) / 2;
    const y = (points[base + 9] + points[base + 17]) / 2;
    builder.addCircle(ox + x * side, oy + y * side, 10);
  });

  const ink = live ? color.accent : color.text3;
  const core = live ? '#EFFFFC' : color.text2;

  return (
    <Canvas style={{ width, height }}>
      <Group opacity={live ? 1 : 0.7}>
        <Path path={trail} style="stroke" strokeWidth={5} strokeCap="round" strokeJoin="round" color={ink} opacity={0.28}>
          <BlurMask blur={4} style="normal" />
        </Path>
        <Path path={trail} style="stroke" strokeWidth={1.6} strokeCap="round" strokeJoin="round" color={ink} opacity={0.75} />
        <Path path={bones} style="stroke" strokeWidth={6} strokeCap="round" color={ink} opacity={live ? 0.28 : 0.12}>
          <BlurMask blur={6} style="normal" />
        </Path>
        <Path path={bones} style="stroke" strokeWidth={2} strokeCap="round" color={ink} opacity={0.9} />
        <Path path={joints} color={core} />
        <Path path={ring} style="stroke" strokeWidth={1.6} color={core} opacity={0.9}>
          <BlurMask blur={2} style="solid" />
        </Path>
      </Group>
    </Canvas>
  );
}
