import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HandPreview } from '../../modules/sigil-control';
import { useI18n } from '../i18n';
import { useSigil, useSigilState } from '../runtime/provider';
import type { StartProblem } from '../runtime/sigil';
import { Icon } from '../ui/icon';
import { Button, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';
import { Checklist } from './checklist';
import { VoiceCard } from './voice-card';

const POWER = 168;

/**
 * Sigil's main screen: one large Start or Stop control for the camera, the
 * cursor and the bubble, what is still missing to control other apps, a live
 * camera view to tune the hand, and voice. The lab cards live in Settings.
 */
export function HomeScreen() {
  const { messages: m } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sigil = useSigil();
  const state = useSigilState();
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<StartProblem | null>(null);
  const t = m.main;

  const toggle = async () => {
    if (state.running) {
      sigil.stop();
      return;
    }
    setStarting(true);
    setProblem(await sigil.start());
    setStarting(false);
  };

  const status = !state.running
    ? t.status.stopped
    : state.paused
      ? t.status.paused
      : state.demo
        ? t.status.demo
        : state.handVisible
          ? t.status.hand
          : t.status.running;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + tokens.space.lg, paddingBottom: insets.bottom + tokens.space.xxl }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.brand} accessibilityRole="header">
            Sigil
          </Text>
          <Text style={styles.tagline}>{m.home.tagline}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.settings}
          hitSlop={12}
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.gear, pressed ? styles.pressed : null]}>
          <Icon name="settings" size={24} color={tokens.color.textMuted} />
        </Pressable>
      </View>

      <View style={styles.power}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={state.running ? t.stop : t.start}
          accessibilityState={{ busy: starting, checked: state.running }}
          disabled={starting}
          onPress={() => void toggle()}
          style={({ pressed }) => [
            styles.powerButton,
            state.running ? styles.powerOn : null,
            pressed || starting ? styles.pressed : null,
          ]}>
          <Icon name={state.running ? 'camera-tracking' : 'gesture-open-palm'} size={44} color={state.running ? tokens.color.accent : tokens.color.text} />
          <Text style={[styles.powerLabel, state.running ? { color: tokens.color.accent } : null]}>
            {starting ? t.starting : state.running ? t.stop : t.start}
          </Text>
        </Pressable>
        <Text style={styles.status} accessibilityLiveRegion="polite">
          {status}
        </Text>
        {problem ? <Text style={styles.problem}>{t.problems[problem]}</Text> : null}
        {state.error ? <Text style={styles.problem}>{m.system.errors.cameraService(state.error)}</Text> : null}
        {state.running ? (
          <View style={styles.row}>
            <Button label={state.paused ? t.resume : t.pause} tone="neutral" onPress={() => sigil.pause(!state.paused)} />
            <Button label={state.demo ? t.stopDemo : t.demo} tone="neutral" onPress={() => (state.demo ? sigil.stopDemo() : void sigil.startDemo())} />
          </View>
        ) : null}
      </View>

      <Checklist />

      {HandPreview ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">
            {t.preview.title}
          </Text>
          <Text style={textStyles.muted}>{state.running ? t.preview.caption : t.preview.off}</Text>
          {state.running && !state.paused ? (
            <HandPreview style={styles.preview} accessibilityLabel={t.preview.title} />
          ) : null}
        </View>
      ) : null}

      <VoiceCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { paddingHorizontal: tokens.space.xl, gap: tokens.space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.md },
  headerText: { flex: 1, gap: tokens.space.xs },
  brand: { color: tokens.color.text, fontSize: tokens.font.size.hero, fontWeight: '700', letterSpacing: 1 },
  tagline: { color: tokens.color.textMuted, fontSize: tokens.font.size.body, lineHeight: 21 },
  gear: { padding: tokens.space.sm, borderRadius: tokens.radius.pill },
  pressed: { opacity: 0.7 },
  power: { alignItems: 'center', gap: tokens.space.md, paddingVertical: tokens.space.md },
  powerButton: {
    width: POWER,
    height: POWER,
    borderRadius: POWER / 2,
    borderWidth: 2,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space.sm,
  },
  powerOn: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  powerLabel: { color: tokens.color.text, fontSize: 20, fontWeight: '700' },
  status: { color: tokens.color.text, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  problem: { color: tokens.color.warning, fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm, justifyContent: 'center' },
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  cardTitle: { color: tokens.color.text, fontSize: tokens.font.size.title, fontWeight: '600' },
  preview: { width: '100%', aspectRatio: 3 / 4, borderRadius: tokens.radius.md, overflow: 'hidden' },
});
