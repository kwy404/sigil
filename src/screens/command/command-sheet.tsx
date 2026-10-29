import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createSpeechToText } from '../../adapters/voice';
import { useI18n } from '../../i18n';
import type { PlanOutcome } from '../../sigil-core';
import { IconButton } from '../../ui/button';
import { Tag } from '../../ui/chip';
import { PressableScale } from '../../ui/press';
import { Sheet } from '../../ui/sheet';
import { color, continuous, family, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { dryRunPlanner } from '../shared';
import { VOICE_CATEGORIES } from '../voice/command-card';
import { PlanView } from './plan-view';

/**
 * The command sheet: type or speak a request and see the plan Sigil would
 * follow, step by step. A dry run; nothing is executed from here.
 */
export function CommandSheet() {
  const params = useLocalSearchParams<{ text?: string }>();
  const { messages: m, speechLocale } = useI18n();
  const insets = useSafeAreaInsets();
  const t = m.ui.command;
  const [text, setText] = useState(params.text ?? '');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<{ request: string; outcome: PlanOutcome } | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const suggestions = VOICE_CATEGORIES.map((category) => m.ui.voice.examples[category][0]);

  const plan = async (request: string) => {
    const clean = request.trim();
    if (!clean) return;
    setText(clean);
    setBusy(true);
    try {
      setResult({ request: clean, outcome: await dryRunPlanner.plan({ text: clean, locale: speechLocale }) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (params.text) void plan(params.text);
    // Plans the text the sheet was opened with, once.
  }, []);

  const speak = async () => {
    setListening(true);
    setResult(null);
    try {
      const transcript = await createSpeechToText(suggestions).listen({ locale: speechLocale, onPartial: setText });
      await plan(transcript.text);
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
            <Txt variant="footnote" tone="tertiary" style={styles.note}>
              {listening ? t.listening : t.note}
            </Txt>

            {result ? (
              <View style={styles.result}>
                <PlanView outcome={result.outcome} request={result.request} />
                <Txt variant="footnote" tone="tertiary">
                  {t.runHint}
                </Txt>
              </View>
            ) : (
              <Animated.View entering={FadeIn.duration(200)} style={styles.suggestions}>
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
              </Animated.View>
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
    textAlignVertical: 'top',
  },
  fieldActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  note: { paddingHorizontal: 4 },
  result: { gap: 10 },
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
