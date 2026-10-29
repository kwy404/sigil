import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createSpeechToText } from '../adapters/voice';
import type { ProfileRegistry } from '../app-profiles';
import {
  describeConfirmation,
  describeFailure,
  describeNotice,
  describePlan,
  describeStep,
  useDescribeContext,
  useI18n,
  type DescribeContext,
} from '../i18n';
import type { ExecutionResult, Plan, PlanOutcome, SigilInterface, StepStatus } from '../sigil-core';
import { Button, Card, Chip, textStyles } from '../ui/primitives';
import { tokens, toneColor, type Tone } from '../ui/tokens';
import { usePlanRunner } from './use-plan-runner';

function statusTone(outcome: PlanOutcome): Tone {
  switch (outcome.status) {
    case 'planned':
      return 'success';
    case 'clarify':
    case 'choose':
      return 'accent';
    case 'blocked':
      return 'danger';
    default:
      return 'warning';
  }
}

const STEP_TONES: Record<StepStatus, Tone> = { running: 'accent', done: 'success', failed: 'danger', cancelled: 'neutral' };

/** One line on how a run ended, in the app language. */
function resultText(result: ExecutionResult, plan: Plan, ctx: DescribeContext): string {
  const { m } = ctx;
  if (result.status === 'completed') {
    return m.planner.result.completed;
  }
  const step = plan.steps[result.completedSteps];
  const reason = describeFailure(result, step, ctx);
  if (reason) {
    return reason;
  }
  if (result.permission) {
    return result.permission === 'write_settings' ? m.system.access.brightness : m.system.access.media;
  }
  if (result.status === 'cancelled') {
    return m.planner.result.cancelled;
  }
  if (result.status === 'refused') {
    return m.planner.result.refused;
  }
  return m.planner.result.failed(step ? describeStep(step, ctx, plan, result.completedSteps) : '');
}

/**
 * Turns a request into a plan with the rule based fallback, shows the steps in
 * the app language and runs them on request. A name that fits several apps
 * shows the options; every send, post or close all waits for a yes on screen.
 */
export function PlannerPanel({ registry, ui }: { registry: ProfileRegistry; ui: SigilInterface }) {
  const { messages: m, speechLocale } = useI18n();
  const ctx = useDescribeContext(registry);
  const runner = usePlanRunner(registry, ui, speechLocale);
  const speech = useMemo(() => createSpeechToText(m.planner.presets), [m]);
  const [listening, setListening] = useState(false);
  const { outcome, events, result, confirmation, running } = runner;

  const listen = async () => {
    setListening(true);
    try {
      const transcript = await speech.listen({ locale: speechLocale });
      await runner.plan(transcript.text);
    } finally {
      setListening(false);
    }
  };

  const statusOf = (index: number) => events.find((event) => event.index === index)?.status;

  return (
    <Card title={m.planner.title} caption={m.planner.caption}>
      <Button label={listening ? m.planner.listening : m.planner.listen} onPress={listen} disabled={listening || running} />
      <View style={styles.presets}>
        {m.planner.presets.map((text) => (
          <Pressable
            key={text}
            accessibilityRole="button"
            disabled={running}
            onPress={() => runner.plan(text)}
            style={({ pressed }) => [styles.preset, pressed ? styles.presetPressed : null]}>
            <Text style={styles.presetText}>{text}</Text>
          </Pressable>
        ))}
      </View>
      {runner.request ? <Text style={textStyles.body}>{m.quote(runner.request)}</Text> : null}
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
                const status = statusOf(index);
                return (
                  <View key={`${index}-${step.kind}`} style={styles.step}>
                    <Text style={[styles.stepIndex, status ? { color: toneColor(STEP_TONES[status]) } : null]}>{index + 1}</Text>
                    <Text style={[styles.stepText, asks ? styles.ask : null, commits ? styles.commit : null]}>
                      {describeStep(step, ctx, outcome.plan, index)}
                      {commits ? `  (${m.planner.afterYes})` : ''}
                    </Text>
                  </View>
                );
              })}
              {confirmation ? (
                <View style={styles.confirm} accessibilityLiveRegion="polite">
                  <Text style={styles.confirmText}>{describeConfirmation(outcome.plan, confirmation.index, ctx)}</Text>
                  <View style={styles.actions}>
                    <Button label={m.planner.yes} tone="success" onPress={() => confirmation.answer(true)} />
                    <Button label={m.planner.no} tone="danger" onPress={() => confirmation.answer(false)} />
                  </View>
                </View>
              ) : null}
              <View style={styles.actions}>
                {running ? (
                  <Button label={m.planner.stop} tone="danger" onPress={runner.stop} />
                ) : (
                  <Button label={m.planner.run} onPress={runner.run} />
                )}
              </View>
              {result ? (
                <Text style={textStyles.body} accessibilityLiveRegion="polite">
                  {resultText(result, outcome.plan, ctx)}
                </Text>
              ) : null}
            </>
          ) : outcome.status === 'choose' ? (
            <>
              <Text style={textStyles.body}>{describeNotice(outcome.notice, ctx)}</Text>
              <View style={styles.actions}>
                {outcome.options.map((option) => (
                  <Button key={option.app} label={option.label} onPress={() => runner.choose(option)} />
                ))}
              </View>
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  confirm: {
    gap: tokens.space.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.warning,
    padding: tokens.space.md,
  },
  confirmText: { color: tokens.color.text, fontSize: 14, fontWeight: '600' },
});
