import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createSpeechToText } from '../adapters/voice';
import type { ProfileRegistry } from '../app-profiles';
import { describeNotice, describePlan, describeStep, useDescribeContext, useI18n } from '../i18n';
import { ActionPlanner, type PlanOutcome } from '../sigil-core';
import { Button, Card, Chip, textStyles } from '../ui/primitives';
import { tokens, type Tone } from '../ui/tokens';
import { useOnDeviceModel } from './use-on-device-model';

function statusTone(outcome: PlanOutcome): Tone {
  switch (outcome.status) {
    case 'planned':
      return 'success';
    case 'clarify':
      return 'accent';
    case 'blocked':
      return 'danger';
    default:
      return 'warning';
  }
}

/**
 * Turns a request into a plan with the on device model when one is
 * downloaded and loaded, or with the rule based fallback, and shows the steps
 * in the app language. Plans are only displayed here, not run. The examples
 * and the mock speech follow the language, and requests are planned with its
 * locale.
 */
export function PlannerPanel({ registry }: { registry: ProfileRegistry }) {
  const { messages: m, speechLocale } = useI18n();
  const ctx = useDescribeContext(registry);
  const { model: onDevice, snapshot } = useOnDeviceModel();
  const planner = useMemo(
    () =>
      new ActionPlanner({
        profiles: registry,
        model: onDevice.languageModel(snapshot.tier),
        modelTimeoutMs: onDevice.plannerTimeoutMs(snapshot.tier),
      }),
    [registry, onDevice, snapshot.tier],
  );
  const speech = useMemo(() => createSpeechToText(m.planner.presets), [m]);
  const [request, setRequest] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null);
  const [listening, setListening] = useState(false);

  const plan = async (text: string) => {
    setRequest(text);
    setOutcome(await planner.plan({ text, locale: speechLocale }));
  };

  const listen = async () => {
    // The model loads while the user speaks, so the request may find it ready.
    planner.prepareModel({ locale: speechLocale });
    setListening(true);
    setOutcome(null);
    try {
      const transcript = await speech.listen({ locale: speechLocale, onPartial: setRequest });
      await plan(transcript.text);
    } finally {
      setListening(false);
    }
  };

  return (
    <Card title={m.planner.title} caption={m.planner.caption}>
      <Button label={listening ? m.planner.listening : m.planner.listen} onPress={listen} disabled={listening} />
      <View style={styles.presets}>
        {m.planner.presets.map((text) => (
          <Pressable
            key={text}
            accessibilityRole="button"
            onPress={() => plan(text)}
            style={({ pressed }) => [styles.preset, pressed ? styles.presetPressed : null]}>
            <Text style={styles.presetText}>{text}</Text>
          </Pressable>
        ))}
      </View>
      {request ? <Text style={textStyles.body}>{m.quote(request)}</Text> : null}
      {outcome ? (
        <View style={styles.outcome}>
          <View style={styles.outcomeHeader}>
            <Chip label={m.planner.status[outcome.status]} tone={statusTone(outcome)} />
            {outcome.status === 'planned' ? <Chip label={m.planner.source[outcome.plan.source]} /> : null}
          </View>
          {outcome.status === 'planned' ? (
            <>
              <Text style={styles.summary}>{describePlan(outcome.plan, ctx)}</Text>
              {outcome.plan.steps.map((step, index) => {
                const asks = step.kind === 'confirm';
                const commits = step.kind === 'tap' && step.commit;
                return (
                  <View key={`${index}-${step.kind}`} style={styles.step}>
                    <Text style={styles.stepIndex}>{index + 1}</Text>
                    <Text style={[styles.stepText, asks ? styles.ask : null, commits ? styles.commit : null]}>
                      {describeStep(step, ctx, outcome.plan, index)}
                      {commits ? `  (${m.planner.afterYes})` : ''}
                    </Text>
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={textStyles.body}>{outcome.status === 'clarify' ? outcome.question : describeNotice(outcome.notice, ctx)}</Text>
          )}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  presets: { gap: tokens.space.sm },
  preset: {
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceRaised,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  presetPressed: { opacity: 0.7 },
  presetText: { color: tokens.color.text, fontSize: 13 },
  outcome: { gap: tokens.space.sm },
  outcomeHeader: { flexDirection: 'row', gap: tokens.space.sm },
  summary: { color: tokens.color.text, fontSize: 15, fontWeight: '600' },
  step: { flexDirection: 'row', gap: tokens.space.sm },
  stepIndex: { color: tokens.color.textMuted, fontFamily: tokens.font.mono, fontSize: 12, width: 18, textAlign: 'right' },
  stepText: { color: tokens.color.text, fontSize: 13, flex: 1 },
  ask: { color: tokens.color.warning, fontWeight: '600' },
  commit: { color: tokens.color.accent },
});
