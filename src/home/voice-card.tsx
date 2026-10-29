import { useRouter } from 'expo-router';
import { useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Text, TextInput, View } from 'react-native';

import type { UnavailableReason } from '../adapters/voice/speech-to-text';
import { resultText } from '../features/result-text';
import { describeConfirmation, describeNotice, describePlan, useDescribeContext, useI18n, type Messages } from '../i18n';
import { useSigil, useVoiceState } from '../runtime/provider';
import { getNativeControl } from '../system-control';
import type { VoiceState } from '../voice/session';
import { Button, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';

type UnavailableKey = keyof Messages['voice']['unavailable'];

function unavailableKey(reason: UnavailableReason): UnavailableKey {
  switch (reason) {
    case 'permission':
    case 'on_device_unavailable':
    case 'no_recognizer':
    case 'language_unsupported':
    case 'language_unavailable':
    case 'busy':
      return reason;
    default:
      return 'failed';
  }
}

/** A bar from 0 to 1 for the microphone level. */
export function LevelMeter({ level, label }: { level: number; label: string }) {
  return (
    <View
      style={styles.meter}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(level * 100) }}>
      <View style={[styles.meterFill, { width: `${Math.round(Math.min(1, Math.max(0, level)) * 100)}%` }]} />
    </View>
  );
}

function Body({ state, busy }: { state: VoiceState; busy: boolean }) {
  const { messages: m, speechLocale } = useI18n();
  const sigil = useSigil();
  const router = useRouter();
  const ctx = useDescribeContext(sigil.profiles);
  const v = m.voice;
  switch (state.phase) {
    case 'idle':
      return null;
    case 'listening':
      return (
        <View style={styles.block} accessibilityLiveRegion="polite">
          {state.retry ? <Text style={styles.warn}>{state.retry === 'not_understood' ? v.notUnderstood : v.repeat}</Text> : null}
          <Text style={styles.strong}>{v.listening}</Text>
          <LevelMeter level={state.level} label={v.listening} />
          {state.noisy ? <Text style={styles.warn}>{v.tooNoisy}</Text> : null}
          {state.partial ? <Text style={textStyles.body}>{m.quote(state.partial)}</Text> : null}
        </View>
      );
    case 'thinking':
      return <Text style={textStyles.body}>{v.thinking(state.heard)}</Text>;
    case 'repeat':
      return (
        <View style={styles.block} accessibilityLiveRegion="polite">
          <Text style={styles.warn}>{busy ? (state.reason === 'not_understood' ? v.notUnderstood : v.repeat) : v.gaveUp}</Text>
          {state.noisy ? <Text style={styles.warn}>{v.tooNoisy}</Text> : null}
        </View>
      );
    case 'choose':
      return (
        <View style={styles.block} accessibilityLiveRegion="polite">
          <Text style={styles.strong}>{describeNotice(state.outcome.notice, ctx)}</Text>
          <View style={styles.row}>
            {state.outcome.options.map((option) => (
              <Button key={option.app} label={option.label} onPress={() => sigil.voice.pick(option)} />
            ))}
          </View>
          <Text style={textStyles.muted}>
            {v.chooseHint} {v.seconds(state.secondsLeft)}
          </Text>
          <LevelMeter level={state.level} label={v.listening} />
        </View>
      );
    case 'confirm':
      return (
        <View style={[styles.block, styles.question]} accessibilityLiveRegion="assertive">
          {state.unsure ? <Text style={styles.warn}>{v.unsure(state.heard)}</Text> : null}
          <Text style={styles.strong}>{describeConfirmation(state.plan, state.index, ctx)}</Text>
          <View style={styles.row}>
            <Button label={m.planner.yes} tone="success" onPress={() => sigil.voice.answer(true)} />
            <Button label={m.planner.no} tone="danger" onPress={() => sigil.voice.answer(false)} />
          </View>
          <Text style={textStyles.muted}>
            {v.answerHint} {v.seconds(state.secondsLeft)}
          </Text>
          <LevelMeter level={state.level} label={v.listening} />
        </View>
      );
    case 'running':
      return <Text style={styles.strong}>{describePlan(state.plan, ctx)}</Text>;
    case 'done':
      return (
        <View style={styles.block} accessibilityLiveRegion="polite">
          {state.outcome.status === 'planned' ? (
            <>
              <Text style={styles.strong}>{describePlan(state.outcome.plan, ctx)}</Text>
              {state.result ? <Text style={textStyles.body}>{resultText(state.result, state.outcome.plan, ctx)}</Text> : null}
            </>
          ) : (
            <Text style={textStyles.body}>
              {state.outcome.status === 'clarify' ? state.outcome.question : describeNotice(state.outcome.notice, ctx)}
            </Text>
          )}
        </View>
      );
    case 'unavailable': {
      const key = unavailableKey(state.reason);
      return (
        <View style={styles.block} accessibilityLiveRegion="polite">
          <Text style={styles.warn}>{v.unavailable[key]}</Text>
          {key === 'permission' && Platform.OS === 'android' ? (
            <Button label={m.main.checklist.allow} onPress={() => void PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)} />
          ) : null}
          {key === 'language_unavailable' ? (
            <Button label={v.download} onPress={() => getNativeControl()?.downloadSpeechModel(speechLocale)} />
          ) : null}
          {key === 'on_device_unavailable' ? <Button label={m.main.settings} tone="neutral" onPress={() => router.push('/settings')} /> : null}
        </View>
      );
    }
    case 'cancelled':
      return <Text style={textStyles.muted}>{v.cancelled}</Text>;
  }
}

/** Talk or type a request; Sigil listens, plans, asks when it must and shows what it did. */
export function VoiceCard() {
  const { messages: m } = useI18n();
  const sigil = useSigil();
  const state = useVoiceState();
  const [typed, setTyped] = useState('');
  const busy = sigil.voice.busy;

  const send = () => {
    const text = typed.trim();
    if (!text) return;
    setTyped('');
    void sigil.voice.startTyped(text);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {m.main.voice.title}
      </Text>
      <Button
        label={busy ? m.planner.stop : m.main.voice.talk}
        tone={busy ? 'danger' : 'accent'}
        onPress={() => (busy ? sigil.voice.cancel() : void sigil.voice.start())}
      />
      <Body state={state} busy={busy} />
      <View style={styles.inputRow}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={send}
          placeholder={m.main.voice.placeholder}
          placeholderTextColor={tokens.color.textMuted}
          accessibilityLabel={m.main.voice.placeholder}
          returnKeyType="go"
          editable={!busy}
          style={styles.input}
        />
        <Button label={m.main.voice.go} onPress={send} disabled={busy || !typed.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  title: { color: tokens.color.text, fontSize: tokens.font.size.title, fontWeight: '600' },
  block: { gap: tokens.space.sm },
  question: { borderColor: tokens.color.warning, borderWidth: 1, borderRadius: tokens.radius.md, padding: tokens.space.md },
  strong: { color: tokens.color.text, fontSize: 15, fontWeight: '600' },
  warn: { color: tokens.color.warning, fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  meter: { height: 6, borderRadius: 3, backgroundColor: tokens.color.border, overflow: 'hidden' },
  meterFill: { height: 6, backgroundColor: tokens.color.accent },
  inputRow: { flexDirection: 'row', gap: tokens.space.sm, alignItems: 'center' },
  input: {
    flex: 1,
    color: tokens.color.text,
    backgroundColor: tokens.color.surfaceRaised,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    fontSize: 15,
  },
});
