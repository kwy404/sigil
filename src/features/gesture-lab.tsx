import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { isSampleId, replayRecording, sampleRecordings, type HandRecording } from '../gesture-engine';
import { describeGesture, useI18n, type Messages } from '../i18n';
import { Card, Chip, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';

function sampleText(recording: HandRecording, m: Messages): { label: string; description: string } {
  return isSampleId(recording.id) ? m.samples[recording.id] : { label: recording.label, description: recording.description };
}

/** Runs the gesture classifier over every sample recording and lists what it recognized. */
export function GestureLab({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { messages: m, format } = useI18n();
  const results = useMemo(
    () => sampleRecordings().map((recording) => ({ recording, result: replayRecording(recording) })),
    [],
  );
  const matched = results.filter((r) => r.result.passed).length;

  return (
    <Card
      title={m.lab.title}
      caption={m.lab.caption(results.length)}
      right={<Chip label={m.lab.matched(matched, results.length)} tone={matched === results.length ? 'success' : 'warning'} />}>
      {results.map(({ recording, result }) => {
        const selected = recording.id === selectedId;
        const text = sampleText(recording, m);
        return (
          <Pressable
            key={recording.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(recording.id)}
            style={[styles.sample, selected ? styles.sampleSelected : null]}>
            <View style={styles.sampleHeader}>
              <Text style={styles.sampleTitle}>{text.label}</Text>
              <Chip label={result.passed ? m.lab.match : m.lab.mismatch} tone={result.passed ? 'success' : 'danger'} />
            </View>
            <Text style={textStyles.muted}>{text.description}</Text>
            <Text style={textStyles.mono}>
              {result.keys.length > 0 ? result.keys.map((key) => describeGesture(key, m)).join(', ') : m.lab.noGesture}
            </Text>
            <Text style={textStyles.muted}>
              {m.lab.stats(result.frameCount, format.number(result.durationMs / 1000, 1), recording.fps)}
            </Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  sample: {
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.space.md,
    gap: tokens.space.xs,
  },
  sampleSelected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  sampleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.sm },
  sampleTitle: { color: tokens.color.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
});
