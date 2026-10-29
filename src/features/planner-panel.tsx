import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createSpeechToText } from '../adapters/voice';
import type { ProfileRegistry } from '../app-profiles';
import { ActionPlanner, describeStep, type PlanOutcome } from '../sigil-core';
import { Button, Card, Chip, textStyles } from '../ui/primitives';
import { tokens, type Tone } from '../ui/tokens';

const PRESETS = [
  'open YouTube',
  'send a message to Ana on WhatsApp saying I am on my way',
  'manda uma mensagem pra mãe no zap dizendo que estou chegando',
  'search for lofi beats on YouTube',
  'post sunset at the beach on Instagram',
  'send happy new year to all my contacts',
];

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
 * Turns a request into a plan with the rule based fallback (no model is
 * installed yet) and shows the steps. Plans are only displayed here, not run.
 */
export function PlannerPanel({ registry }: { registry: ProfileRegistry }) {
  const planner = useMemo(() => new ActionPlanner({ profiles: registry }), [registry]);
  const speech = useMemo(() => createSpeechToText(), []);
  const [request, setRequest] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null);
  const [listening, setListening] = useState(false);

  const plan = async (text: string) => {
    setRequest(text);
    setOutcome(await planner.plan({ text }));
  };

  const listen = async () => {
    setListening(true);
    setOutcome(null);
    try {
      const transcript = await speech.listen({ locale: 'en-US', onPartial: setRequest });
      await plan(transcript.text);
    } finally {
      setListening(false);
    }
  };

  return (
    <Card
      title="Voice planner"
      caption="A request becomes one intent, then a fixed chain of steps. Sending and posting always stop for your yes. Speech is a mock engine until whisper.rn or the system recognizer is wired in.">
      <Button label={listening ? 'Listening...' : 'Listen (mock speech)'} onPress={listen} disabled={listening} />
      <View style={styles.presets}>
        {PRESETS.map((text) => (
          <Pressable
            key={text}
            accessibilityRole="button"
            onPress={() => plan(text)}
            style={({ pressed }) => [styles.preset, pressed ? styles.presetPressed : null]}>
            <Text style={styles.presetText}>{text}</Text>
          </Pressable>
        ))}
      </View>
      {request ? <Text style={textStyles.body}>{`"${request}"`}</Text> : null}
      {outcome ? (
        <View style={styles.outcome}>
          <View style={styles.outcomeHeader}>
            <Chip label={outcome.status.replace('_', ' ')} tone={statusTone(outcome)} />
            {outcome.status === 'planned' ? <Chip label={`from ${outcome.plan.source}`} /> : null}
          </View>
          {outcome.status === 'planned' ? (
            <>
              <Text style={styles.summary}>{outcome.plan.summary}</Text>
              {outcome.plan.steps.map((step, index) => {
                const asks = step.kind === 'confirm';
                const commits = step.kind === 'tap' && step.commit;
                return (
                  <View key={`${index}-${step.kind}`} style={styles.step}>
                    <Text style={styles.stepIndex}>{index + 1}</Text>
                    <Text style={[styles.stepText, asks ? styles.ask : null, commits ? styles.commit : null]}>
                      {describeStep(step)}
                      {commits ? '  (only after your yes)' : ''}
                    </Text>
                  </View>
                );
              })}
            </>
          ) : (
            <Text style={textStyles.body}>{outcome.status === 'clarify' ? outcome.question : outcome.message}</Text>
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
