import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GestureLab } from '@/features/gesture-lab';
import { PlannerPanel } from '@/features/planner-panel';
import { ProfilesPanel } from '@/features/profiles-panel';
import { SphereQuickActions } from '@/features/sphere-quick-actions';
import { SphereStage } from '@/features/sphere-stage';
import { SystemPanel } from '@/features/system-panel';
import { sampleRecordings } from '@/gesture-engine';
import { useI18n } from '@/i18n';
import { useSigil } from '@/runtime/provider';
import type { SigilInterface } from '@/sigil-core';
import { Card } from '@/ui/primitives';
import { tokens } from '@/ui/tokens';

const SIDE = tokens.space.xl;

/** The developer cards: recorded gestures on the sphere, the planner, app profiles and system details. */
export default function Lab() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { messages: m } = useI18n();
  const sigil = useSigil();
  const router = useRouter();
  const samples = useMemo(() => sampleRecordings(), []);
  const [sampleId, setSampleId] = useState<string | null>('circle-cw');
  const [segment, setSegment] = useState<string | null>(null);
  const ui = useMemo<SigilInterface>(
    () => ({
      sphere: (action) => setSegment(action === 'open' ? 'apps' : null),
      tutorial: () => router.push('/tutorial?replay=1'),
    }),
    [router],
  );

  const stageSize = Math.min(width - 2 * SIDE - 2 * tokens.space.lg, 340);
  const recording = samples.find((sample) => sample.id === sampleId) ?? null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + tokens.space.lg, paddingBottom: insets.bottom + tokens.space.xxl }]}>
      <Card title={m.home.sphereTitle} caption={m.home.sphereCaption}>
        <SphereStage size={stageSize} recording={recording} activeSegment={segment} onSelectSegment={setSegment} />
        <SphereQuickActions />
      </Card>
      <GestureLab selectedId={sampleId} onSelect={setSampleId} />
      <PlannerPanel registry={sigil.profiles} ui={ui} />
      <ProfilesPanel registry={sigil.profiles} />
      <SystemPanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { paddingHorizontal: SIDE, gap: tokens.space.lg },
});
