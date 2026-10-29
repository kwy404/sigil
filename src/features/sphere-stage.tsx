import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { cancelAnimation, Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { ControlSphere } from '../control-sphere';
import { HoloCursor } from '../cursor-overlay';
import {
  DEFAULT_CONTROL_BOX,
  describeGesture,
  gestureKey,
  mapToScreen,
  traceRecording,
  type HandRecording,
} from '../gesture-engine';
import { tokens } from '../ui/tokens';

/** Pause at the end of each loop, in milliseconds. */
const LOOP_PAUSE_MS = 700;
/** How long a recognized gesture stays in the caption, in milliseconds. */
const CAPTION_MS = 900;

interface CursorPath {
  xs: number[];
  ys: number[];
  press: number[];
  shown: number[];
  durationMs: number;
  events: { at: number; label: string }[];
}

function buildPath(recording: HandRecording, size: number): CursorPath {
  const trace = traceRecording(recording);
  const first = recording.frames.length > 0 ? recording.frames[0].t : 0;
  const last = recording.frames.length > 0 ? recording.frames[recording.frames.length - 1].t : 0;
  const path: CursorPath = { xs: [], ys: [], press: [], shown: [], durationMs: Math.max(400, last - first), events: [] };
  for (const point of trace.points) {
    const position = point.cursor ? mapToScreen(point.cursor, DEFAULT_CONTROL_BOX, { width: size, height: size }) : null;
    path.xs.push(position ? position.x : size / 2);
    path.ys.push(position ? position.y : size / 2);
    path.press.push(point.pinching ? 1 : 0);
    path.shown.push(point.cursor ? 1 : 0);
  }
  path.events = trace.events
    .filter((event) => event.phase !== 'end')
    .map((event) => ({ at: event.t - first, label: describeGesture(gestureKey(event)) }));
  return path;
}

/**
 * The Control Sphere with the holographic cursor replaying a recording: every
 * cursor position is the classifier's filtered fingertip, mapped through the
 * same control box the live camera uses.
 */
export function SphereStage({
  size,
  recording,
  activeSegment,
  onSelectSegment,
}: {
  size: number;
  recording: HandRecording | null;
  activeSegment: string | null;
  onSelectSegment: (id: string) => void;
}) {
  const path = useMemo(() => (recording ? buildPath(recording, size) : null), [recording, size]);
  const [caption, setCaption] = useState<string | null>(null);

  const xs = path?.xs ?? [];
  const ys = path?.ys ?? [];
  const press = path?.press ?? [];
  const shown = path?.shown ?? [];
  const duration = path?.durationMs ?? 1;
  const loop = duration + LOOP_PAUSE_MS;

  const progress = useSharedValue(0);
  useEffect(() => {
    if (!path) {
      return;
    }
    progress.set(0);
    progress.set(withRepeat(withTiming(1, { duration: loop, easing: Easing.linear }), -1, false));
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = (Date.now() - started) % loop;
      const recent = [...path.events].reverse().find((e) => e.at <= elapsed && elapsed - e.at < CAPTION_MS);
      setCaption(recent ? recent.label : null);
    }, 100);
    return () => {
      clearInterval(timer);
      cancelAnimation(progress);
    };
  }, [path, loop, progress]);

  const x = useDerivedValue(() => {
    const n = xs.length;
    return n === 0 ? size / 2 : xs[Math.min(n - 1, Math.floor(((progress.get() * loop) / duration) * n))];
  }, [xs, loop, duration, size]);
  const y = useDerivedValue(() => {
    const n = ys.length;
    return n === 0 ? size / 2 : ys[Math.min(n - 1, Math.floor(((progress.get() * loop) / duration) * n))];
  }, [ys, loop, duration, size]);
  const pressed = useDerivedValue(() => {
    const n = press.length;
    return n === 0 ? 0 : press[Math.min(n - 1, Math.floor(((progress.get() * loop) / duration) * n))];
  }, [press, loop, duration]);
  const visible = useDerivedValue(() => {
    const n = shown.length;
    return n === 0 ? 0 : shown[Math.min(n - 1, Math.floor(((progress.get() * loop) / duration) * n))];
  }, [shown, loop, duration]);

  return (
    <View style={styles.stage}>
      <ControlSphere size={size} activeId={activeSegment} onSelect={onSelectSegment}>
        {path ? <HoloCursor x={x} y={y} press={pressed} visible={visible} /> : null}
      </ControlSphere>
      <Text style={styles.caption} accessibilityLiveRegion="polite">
        {recording ? (caption ?? recording.label) : 'Pick a sample in the gesture lab to replay it here.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignItems: 'center', gap: tokens.space.md },
  caption: { color: tokens.color.accent, fontSize: 14, fontWeight: '600', minHeight: 20 },
});
