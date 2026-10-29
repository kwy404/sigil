import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeGesture, replayRecording, sampleRecordings } from '../gesture-engine';
import { Card, Chip, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';

/** Runs the gesture classifier over every sample recording and lists what it recognized. */
export function GestureLab({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const results = useMemo(
    () => sampleRecordings().map((recording) => ({ recording, result: replayRecording(recording) })),
    [],
  );
  const matched = results.filter((r) => r.result.passed).length;

  return (
    <Card
      title="Gesture lab"
      caption={`The classifier replays ${results.length} hand recordings made with the synthetic hand rig, the same ones the unit tests use. Tap one to replay it on the sphere.`}
      right={<Chip label={`${matched}/${results.length} match`} tone={matched === results.length ? 'success' : 'warning'} />}>
      {results.map(({ recording, result }) => {
        const selected = recording.id === selectedId;
        return (
          <Pressable
            key={recording.id}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onSelect(recording.id)}
            style={[styles.sample, selected ? styles.sampleSelected : null]}>
            <View style={styles.sampleHeader}>
              <Text style={styles.sampleTitle}>{recording.label}</Text>
              <Chip label={result.passed ? 'match' : 'mismatch'} tone={result.passed ? 'success' : 'danger'} />
            </View>
            <Text style={textStyles.muted}>{recording.description}</Text>
            <Text style={textStyles.mono}>
              {result.keys.length > 0 ? result.keys.map(describeGesture).join(', ') : 'no gesture'}
            </Text>
            <Text style={textStyles.muted}>
              {`${result.frameCount} frames, ${(result.durationMs / 1000).toFixed(1)} s at ${recording.fps} fps`}
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
