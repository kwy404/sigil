import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import type { SessionActions, SessionState } from '../../session/types';
import { GridBackdrop, Glow } from '../../ui/backdrop';
import { StatusChip, Tag } from '../../ui/chip';
import { Glyph } from '../../ui/glyph';
import { PressableScale } from '../../ui/press';
import { color, continuous, GUTTER, springs, type StatusTone } from '../../ui/theme';
import { Txt } from '../../ui/type';

const MIC = 112;

function noiseOf(session: SessionState): { key: 'idle' | 'quiet' | 'some' | 'loud'; tone: StatusTone } {
  if (!session.listening) return { key: 'idle', tone: 'neutral' };
  if (session.micLevel < 0.3) return { key: 'quiet', tone: 'success' };
  if (session.micLevel < 0.72) return { key: 'some', tone: 'info' };
  return { key: 'loud', tone: 'warning' };
}

function Ring({ level, index, active }: { level: number; index: number; active: boolean }) {
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0);
  useEffect(() => {
    const target = active ? 1.12 + index * 0.2 + level * (0.28 + index * 0.12) : 1;
    scale.set(reduceMotion ? target : withSpring(target, springs.glide));
    opacity.set(withTiming(active ? 0.42 - index * 0.11 : 0, { duration: 220 }));
  }, [level, index, active, reduceMotion, scale, opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ scale: scale.get() }] }));
  return <Animated.View style={[styles.ring, style]} pointerEvents="none" />;
}

/** The big mic: tap to talk, rings that follow the voice, and the noise of the room. */
export function MicHero({ session }: { session: SessionState & SessionActions }) {
  const { messages: m } = useI18n();
  const t = m.ui.voice;
  const [width, setWidth] = useState(350);
  const noise = noiseOf(session);
  const listening = session.listening;

  return (
    <View style={[styles.card, continuous]} onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}>
      <GridBackdrop cell={22} opacity={0.08} fadeTo={color.surface} center={{ x: 0.5, y: 0.4 }} />
      <Glow x={width / 2} y={128} radius={180} tint={listening ? color.info : color.accent} opacity={listening ? 0.2 : 0.12} />
      <View style={styles.chips}>
        <StatusChip tone={noise.tone} label={t.noise[noise.key]} live={listening} />
        <Tag label={m.ui.common.onDevice} icon="privacy-shield" />
      </View>
      <View style={styles.micStage}>
        {[0, 1, 2].map((index) => (
          <Ring key={index} index={index} level={session.micLevel} active={listening} />
        ))}
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={listening ? m.ui.pill.stopTalking : m.ui.pill.talk}
          accessibilityState={{ selected: listening }}
          haptics="press"
          scaleTo={0.94}
          onPress={() => (listening ? session.stopListening() : session.listen())}
          style={[styles.mic, listening ? styles.micActive : null]}>
          <Glyph name="mic" size={44} color={listening ? color.accentInk : color.accent} stroke={2.2} />
        </PressableScale>
      </View>
      <Txt variant="title1" align="center" accessibilityLiveRegion="polite">
        {listening ? t.heroListening : t.heroIdle}
      </Txt>
      <Txt variant="callout" tone="secondary" align="center">
        {listening ? t.heroStop : t.heroHint}
      </Txt>
      <Txt variant="footnote" tone="tertiary" align="center" style={styles.privacy}>
        {t.privacy}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 22,
    gap: 6,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  chips: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  micStage: { height: 200, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: MIC,
    height: MIC,
    borderRadius: MIC / 2,
    borderWidth: 1.5,
    borderColor: color.accent,
  },
  mic: {
    width: MIC,
    height: MIC,
    borderRadius: MIC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surfaceHigh,
    borderWidth: 1,
    borderColor: color.accentLine,
    boxShadow: '0px 0px 40px rgba(94, 242, 223, 0.18)',
  },
  micActive: { backgroundColor: color.accent, borderColor: color.accent },
  privacy: { marginTop: 6 },
});
