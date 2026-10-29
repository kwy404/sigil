import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileRegistry } from '@/app-profiles';
import { GestureLab } from '@/features/gesture-lab';
import { LanguagePanel } from '@/features/language-panel';
import { PlannerPanel } from '@/features/planner-panel';
import { ProfilesPanel } from '@/features/profiles-panel';
import { SphereQuickActions } from '@/features/sphere-quick-actions';
import { SphereStage } from '@/features/sphere-stage';
import { SystemPanel } from '@/features/system-panel';
import { sampleRecordings } from '@/gesture-engine';
import { useI18n } from '@/i18n';
import { readSettings } from '@/settings/store';
import type { SigilInterface } from '@/sigil-core';
import { needsTutorial } from '@/tutorial/machine';
import { Button, Card } from '@/ui/primitives';
import { tokens } from '@/ui/tokens';

const SIDE = tokens.space.xl;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { messages: m } = useI18n();
  const router = useRouter();
  const registry = useMemo(() => ProfileRegistry.withBuiltins(), []);
  const samples = useMemo(() => sampleRecordings(), []);
  const [sampleId, setSampleId] = useState<string | null>('circle-cw');
  const [segment, setSegment] = useState<string | null>(null);
  // The guided tour comes first on the first launch, in the language already detected.
  const [firstRun] = useState(() => needsTutorial(readSettings().tutorial));

  const ui = useMemo<SigilInterface>(
    () => ({
      sphere: (action) => setSegment(action === 'open' ? 'apps' : null),
      tutorial: () => router.push('/tutorial?replay=1'),
    }),
    [router],
  );

  if (firstRun) {
    return <Redirect href="/tutorial" />;
  }

  const stageSize = Math.min(width - 2 * SIDE - 2 * tokens.space.lg, 340);
  const recording = samples.find((sample) => sample.id === sampleId) ?? null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + tokens.space.lg, paddingBottom: insets.bottom + tokens.space.xxl },
      ]}>
      <View style={styles.hero}>
        <Text style={styles.brand} accessibilityRole="header">
          Sigil
        </Text>
        <Text style={styles.tagline}>{m.home.tagline}</Text>
      </View>

      <Card title={m.home.sphereTitle} caption={m.home.sphereCaption}>
        <SphereStage size={stageSize} recording={recording} activeSegment={segment} onSelectSegment={setSegment} />
        <SphereQuickActions />
      </Card>

      <PlannerPanel registry={registry} ui={ui} />
      <GestureLab selectedId={sampleId} onSelect={setSampleId} />
      <ProfilesPanel registry={registry} />
      <SystemPanel />
      <Card title={m.tutorial.label} caption={m.tutorial.redoCaption}>
        <Button label={m.tutorial.redo} onPress={ui.tutorial} />
      </Card>
      <LanguagePanel />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { paddingHorizontal: SIDE, gap: tokens.space.lg },
  hero: { gap: tokens.space.xs, paddingBottom: tokens.space.sm },
  brand: { color: tokens.color.text, fontSize: tokens.font.size.hero, fontWeight: '700', letterSpacing: 1 },
  tagline: { color: tokens.color.textMuted, fontSize: tokens.font.size.body, lineHeight: 21 },
});
