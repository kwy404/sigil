import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useI18n } from '../i18n';
import { Glyph, type GlyphName } from './glyph';
import { haptic } from './haptics';
import { color, springs } from './theme';
import { Txt } from './type';

export interface ScrubberProps {
  label: string;
  /** From 0 to 1, or null when the level cannot be read here. */
  value: number | null;
  /** Called with a percent when the finger lifts. */
  onCommit: (percent: number) => void;
  iconLow: GlyphName;
  iconHigh: GlyphName;
  /** Shown instead of the value when it cannot be read. */
  unavailable: string;
}

function clamp01(value: number): number {
  'worklet';
  return Math.min(1, Math.max(0, value));
}

/**
 * A level scrubber in the Now Playing style: a thin track that thickens under
 * the finger, a tabular percent, and the icons for low and high. Drag or tap
 * anywhere on the track; screen readers adjust it in steps of 10.
 */
export function Scrubber({ label, value, onCommit, iconLow, iconHigh, unavailable }: ScrubberProps) {
  const { format } = useI18n();
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(value ?? 0);
  const width = useSharedValue(1);
  const start = useSharedValue(0);
  const active = useSharedValue(0);
  const [dragging, setDragging] = useState(false);
  const [shown, setShown] = useState<number | null>(value === null ? null : Math.round(value * 100));
  const disabled = value === null;

  useEffect(() => {
    if (dragging || value === null) return;
    progress.set(reduceMotion ? value : withTiming(value, { duration: 240 }));
    setShown(Math.round(value * 100));
  }, [value, dragging, reduceMotion, progress]);

  const commit = (fraction: number) => {
    const percent = Math.round(fraction * 100);
    setShown(percent);
    setDragging(false);
    haptic.selection();
    onCommit(percent);
  };
  const preview = (percent: number) => setShown(percent);
  const begin = () => setDragging(true);

  const pan = usePanGesture({
    enabled: !disabled,
    activeOffsetX: [-4, 4],
    failOffsetY: [-14, 14],
    onActivate: () => {
      'worklet';
      start.set(progress.get());
      active.set(withSpring(1, springs.press));
      scheduleOnRN(begin);
    },
    onUpdate: (event) => {
      'worklet';
      const next = clamp01(start.get() + event.translationX / width.get());
      const before = Math.round(progress.get() * 100);
      progress.set(next);
      const after = Math.round(next * 100);
      if (after !== before) scheduleOnRN(preview, after);
    },
    onDeactivate: () => {
      'worklet';
      active.set(withSpring(0, springs.settle));
      scheduleOnRN(commit, progress.get());
    },
  });

  const tap = useTapGesture({
    enabled: !disabled,
    onActivate: (event) => {
      'worklet';
      const next = clamp01(event.x / width.get());
      progress.set(withSpring(next, springs.snap));
      scheduleOnRN(commit, next);
    },
  });

  const gesture = useCompetingGestures(pan, tap);

  const track = useAnimatedStyle(() => ({
    height: 6 + 4 * active.get(),
    marginVertical: 9 - 2 * active.get(),
  }));
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));

  const onLayout = (event: LayoutChangeEvent) => width.set(Math.max(1, event.nativeEvent.layout.width));

  const step = (delta: number) => {
    if (value === null) return;
    const next = Math.min(100, Math.max(0, Math.round((shown ?? 0) + delta)));
    progress.set(withTiming(next / 100, { duration: 160 }));
    commit(next / 100);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Txt variant="caption" tone="secondary">
          {label}
        </Txt>
        <Txt variant="mono" tone={disabled ? 'tertiary' : dragging ? 'accent' : 'secondary'}>
          {shown === null ? unavailable : format.percent(shown)}
        </Txt>
      </View>
      <View style={styles.row}>
        <Glyph name={iconLow} size={18} color={color.text3} />
        <GestureDetector gesture={gesture}>
          <View
            style={styles.hit}
            onLayout={onLayout}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={label}
            accessibilityState={{ disabled }}
            accessibilityValue={shown === null ? { text: unavailable } : { min: 0, max: 100, now: shown }}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 10 : -10)}>
            <Animated.View style={[styles.track, track, disabled ? styles.trackDisabled : null]}>
              <Animated.View style={[styles.fill, fill, dragging ? styles.fillActive : null]} />
            </Animated.View>
          </View>
        </GestureDetector>
        <Glyph name={iconHigh} size={20} color={color.text3} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 30 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hit: { flex: 1, height: 32, justifyContent: 'center' },
  track: { borderRadius: 999, backgroundColor: 'rgba(186, 214, 255, 0.16)', overflow: 'hidden' },
  trackDisabled: { opacity: 0.45 },
  fill: { height: '100%', borderRadius: 999, backgroundColor: color.text },
  fillActive: { backgroundColor: color.accent },
});
