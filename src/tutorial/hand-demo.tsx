import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FINGER_CHAINS, FINGERS, sampleRecordings, type Landmark, type SampleId } from '../gesture-engine';
import { tokens } from '../ui/tokens';

/** Pause at the end of each loop, in milliseconds. */
const LOOP_PAUSE_MS = 600;
const PADDING = 0.12;

/** Bones from the wrist to each finger base, along each finger, and across the palm. */
const BONES: [number, number][] = [
  ...FINGERS.flatMap((finger) => {
    const [a, b, c, d] = FINGER_CHAINS[finger];
    return [
      [0, a],
      [a, b],
      [b, c],
      [c, d],
    ] as [number, number][];
  }),
  [5, 9],
  [9, 13],
  [13, 17],
];

/**
 * A recorded hand performing a gesture, drawn as a skeleton and played in a
 * loop. The recordings are the synthetic ones the tests use. With reduced
 * motion on, it shows one still frame from the middle of the gesture.
 */
export function HandDemo({ sample, size }: { sample: SampleId; size: number }) {
  const reduceMotion = useReducedMotion();
  const frames = useMemo(
    () =>
      (sampleRecordings().find((recording) => recording.id === sample)?.frames ?? []).filter(
        (frame): frame is typeof frame & { landmarks: readonly Landmark[] } => frame.landmarks !== null,
      ),
    [sample],
  );
  const [index, setIndex] = useState(0);

  // Fit every frame of the recording in the square, so the motion stays visible.
  const fit = useMemo(() => {
    let minX = 1;
    let minY = 1;
    let maxX = 0;
    let maxY = 0;
    for (const frame of frames) {
      for (const point of frame.landmarks) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    const span = Math.max(maxX - minX, maxY - minY, 0.01);
    const scale = (size * (1 - 2 * PADDING)) / span;
    return {
      x: (value: number) => size / 2 + (value - (minX + maxX) / 2) * scale,
      y: (value: number) => size / 2 + (value - (minY + maxY) / 2) * scale,
    };
  }, [frames, size]);

  useEffect(() => {
    if (reduceMotion || frames.length < 2) {
      return;
    }
    const first = frames[0].t;
    const loop = frames[frames.length - 1].t - first + LOOP_PAUSE_MS;
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) % loop;
      let next = 0;
      while (next < frames.length - 1 && frames[next + 1].t - first <= elapsed) next++;
      setIndex(next);
    }, 33);
    return () => clearInterval(timer);
  }, [frames, reduceMotion]);

  const frame = frames.length > 0 ? frames[reduceMotion ? Math.floor(frames.length * 0.6) : Math.min(index, frames.length - 1)] : null;
  const bones = useMemo(() => {
    if (!frame) return null;
    const builder = Skia.PathBuilder.Make();
    for (const [a, b] of BONES) {
      const p = frame.landmarks[a];
      const q = frame.landmarks[b];
      builder.moveTo(fit.x(p.x), fit.y(p.y)).lineTo(fit.x(q.x), fit.y(q.y));
    }
    return builder.detach();
  }, [frame, fit]);

  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width: size, height: size }}>
      <Canvas style={{ width: size, height: size }}>
        {bones ? (
          <Path path={bones} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" color={tokens.color.accent} opacity={0.85} />
        ) : null}
        {frame?.landmarks.map((point, i) => (
          <Circle key={i} cx={fit.x(point.x)} cy={fit.y(point.y)} r={i === 4 || i === 8 ? 5 : 3} color={tokens.color.accentBright} />
        ))}
      </Canvas>
    </View>
  );
}
