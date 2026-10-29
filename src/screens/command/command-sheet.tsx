import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createSpeechToText } from '../../adapters/voice';
import { resultText } from '../../features/result-text';
import { useDescribeContext, useI18n } from '../../i18n';
import { getSigil, planRequest } from '../../session';
import type { ExecutionResult, PlanOutcome } from '../../sigil-core';
import { Button, IconButton } from '../../ui/button';
import { StatusChip, Tag } from '../../ui/chip';
import { haptic } from '../../ui/haptics';
import { PressableScale } from '../../ui/press';
import { Sheet } from '../../ui/sheet';
import { color, continuous, family, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { registry } from '../shared';
import { VOICE_CATEGORIES } from '../voice/command-card';
import { PlanView } from './plan-view';

const RUN_TONE = { completed: 'success', failed: 'danger', cancelled: 'neutral', refused: 'warning' } as const;
const RUN_OUTCOME = { completed: 'done', failed: 'failed', cancelled: 'cancelled', refused: 'not_understood' } as const;

/**
 * The command sheet: type or speak a request and see the plan Sigil would
 * follow, step by step, as a dry run. Run it then carries it out like a
 * spoken request, with the same confirmations before sending or posting.
 */
export function CommandSheet() {
  const params = useLocalSearchParams<{ text?: string }>();
  const { messages: m, speechLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const t = m.ui.command;
  const ctx = useDescribeContext(registry);
  const [text, setText] = useState(params.text ?? '');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<{ request: string; outcome: PlanOutcome } | null>(null);
  const [running, setRunning] = useState(false);
  const [ran, setRan] = useState<ExecutionResult | null>(null);
  const [heardNothing, setHeardNothing] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const suggestions = VOICE_CATEGORIES.map((category) => m.ui.voice.examples[category][0]);

  const plan = async (request: string) => {
    const clean = request.trim();
    if (!clean) return;
    setText(clean);
    setBusy(true);
    setRan(null);
    try {
      const { outcome } = await planRequest(clean, { dryRun: true });
      setResult({ request: clean, outcome });
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!result) return;
    setRunning(true);
    try {
      const { result: execution } = await planRequest(result.request, { dryRun: false });
      setRan(execution);
      if (execution?.status === 'completed') haptic.success();
      else if (execution) haptic.warning();
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (params.text) void plan(params.text);
    // Plans the text the sheet was opened with, once.
  }, []);

  const speak = async () => {
    setListening(true);
    setResult(null);
    setHeardNothing(false);
    try {
      // The phone's recognizer where there is one; elsewhere a scripted engine that hears the examples.
      const engine = getSigil().native ? getSigil().speech : createSpeechToText(suggestions);
      const transcript = await engine.listen({ locale: speechLocale, onPartial: setText });
      await plan(transcript.text);
    } catch {
      setHeardNothing(true);
    } finally {
      setListening(false);
    }
  };

  return (
    <Sheet closeLabel={m.ui.common.close}>
      {(close) => (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <View style={styles.headerSide}>
              <IconButton icon="chevron-down" label={m.ui.common.close} onPress={close} variant="plain" size={40} />
            </View>
            <Txt variant="monoTag" tone="secondary" align="center" style={styles.flex}>
              {t.title}
            </Txt>
            <View style={[styles.headerSide, styles.headerRight]}>
              <Tag label={t.dryRun} icon="privacy-shield" accent />
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}>
            <View style={[styles.field, continuous]}>
              <TextInput
                ref={input}
                value={text}
                onChangeText={(value) => {
                  setText(value);
                  if (result) setResult(null);
                }}
                placeholder={t.placeholder}
                placeholderTextColor={color.text3}
                autoFocus={!params.text}
                returnKeyType="go"
                onSubmitEditing={() => void plan(text)}
                style={styles.input}
                multiline
                blurOnSubmit
                accessibilityLabel={t.placeholder}
              />
              <View style={styles.fieldActions}>
                <IconButton icon="mic" label={t.speak} onPress={() => void speak()} active={listening} size={44} variant="secondary" />
                <IconButton
                  icon="arrow-up"
                  label={t.plan}
                  onPress={() => void plan(text)}
                  disabled={busy || text.trim().length === 0}
                  size={44}
                  variant="primary"
                />
              </View>
            </View>
            <Txt variant="footnote" tone={heardNothing ? 'warning' : 'tertiary'} style={styles.note}>
              {listening ? t.listening : heardNothing ? m.ui.common.heardNothing : t.note}
            </Txt>

            {result ? (
              <View style={styles.result}>
                <PlanView outcome={result.outcome} request={result.request} />
                {result.outcome.status === 'planned' ? (
                  <View style={styles.runRow}>
                    <Button
                      label={running ? t.running : t.run}
                      icon="play"
                      size="lg"
                      block
                      loading={running}
                      onPress={() => void run()}
                    />
                    {ran ? (
                      <Animated.View entering={FadeIn.duration(200)} style={styles.ran}>
                        <StatusChip tone={RUN_TONE[ran.status]} label={m.ui.voice.outcomes[RUN_OUTCOME[ran.status]]} />
                        {result.outcome.status === 'planned' ? (
                          <Txt variant="footnote" tone="secondary" style={styles.flex}>
                            {resultText(ran, result.outcome.plan, ctx)}
                          </Txt>
                        ) : null}
                      </Animated.View>
                    ) : (
                      <Txt variant="footnote" tone="tertiary">
                        {t.runNote}
                      </Txt>
                    )}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={styles.suggestions}>
                <Txt variant="monoTag" tone="tertiary">
                  {t.suggestions}
                </Txt>
                {suggestions.map((suggestion) => (
                  <PressableScale
                    key={suggestion}
                    accessibilityRole="button"
                    onPress={() => void plan(suggestion)}
                    scaleTo={0.98}
                    style={[styles.suggestion, continuous]}>
                    <Txt variant="callout" numberOfLines={2} style={styles.flex}>
                      {m.quote(suggestion)}
                    </Txt>
                    <Txt variant="monoTag" tone="accent">
                      {t.plan}
                    </Txt>
                  </PressableScale>
                ))}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: GUTTER - 4 },
  headerSide: { width: 118, flexDirection: 'row', alignItems: 'center' },
  headerRight: { justifyContent: 'flex-end' },
  content: { paddingHorizontal: GUTTER, paddingTop: 12, gap: 14 },
  field: {
    minHeight: 120,
    padding: 16,
    paddingBottom: 12,
    borderRadius: 24,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.hairlineFocus,
    justifyContent: 'space-between',
    gap: 12,
  },
  input: {
    color: color.text,
    fontFamily: family.displayRegular,
    fontSize: 21,
    lineHeight: 28,
    minHeight: 56,
    padding: 0,
    outlineWidth: 0,
    textAlignVertical: 'top',
  },
  fieldActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  note: { paddingHorizontal: 4 },
  result: { gap: 10 },
  runRow: { gap: 10, marginTop: 4 },
  ran: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  suggestions: { gap: 10, marginTop: 6 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
});
