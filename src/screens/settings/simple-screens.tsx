import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { ProfileRegistry } from '../../app-profiles';
import { GestureLab } from '../../features/gesture-lab';
import { PlannerPanel } from '../../features/planner-panel';
import { ProfilesPanel } from '../../features/profiles-panel';
import { SphereQuickActions } from '../../features/sphere-quick-actions';
import { SphereStage } from '../../features/sphere-stage';
import { SystemPanel } from '../../features/system-panel';
import { sampleRecordings } from '../../gesture-engine';
import type { SigilInterface } from '../../sigil-core';
import { useI18n } from '../../i18n';
import { usePreferences } from '../../preferences/provider';
import { Button } from '../../ui/button';
import { StatusChip } from '../../ui/chip';
import { ListGroup, ListRow } from '../../ui/list';
import { Card } from '../../ui/primitives';
import { Screen, Section } from '../../ui/screen';
import { useSkiaReady } from '../../ui/skia-ready';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { useBackLabel } from '../shared';
import { ModelSlot } from './model-slot';
import { appVersion } from './settings-screen';

export function ModelScreen() {
  const { messages: m } = useI18n();
  const backLabel = useBackLabel();
  return (
    <Screen title={m.ui.settings.model} back={{ label: backLabel }}>
      <Txt variant="callout" tone="secondary" style={styles.caption}>
        {m.ui.settings.modelCaption}
      </Txt>
      <View style={styles.block}>
        <ModelSlot />
      </View>
    </Screen>
  );
}

export function TutorialSettingsScreen() {
  const { messages: m, language } = useI18n();
  const preferences = usePreferences();
  const backLabel = useBackLabel();
  const t = m.ui.settings.tutorialPage;
  const record = preferences.tour;
  let date = '';
  if (record) {
    try {
      date = new Date(record.completedAt).toLocaleDateString(language);
    } catch {
      date = new Date(record.completedAt).toDateString();
    }
  }

  return (
    <Screen title={m.ui.settings.tutorial} back={{ label: backLabel }}>
      <Txt variant="callout" tone="secondary" style={styles.caption}>
        {t.body}
      </Txt>
      <View style={[styles.statusCard, continuous]}>
        <StatusChip tone={record ? 'success' : 'warning'} label={record ? t.completed : t.notCompleted} />
        {record ? (
          <Txt variant="mono" tone="tertiary">
            {date}
          </Txt>
        ) : null}
        {record && record.skipped.length > 0 ? (
          <Txt variant="footnote" tone="secondary">
            {t.skipped(record.skipped.length)}
          </Txt>
        ) : null}
      </View>
      <View style={styles.blockPadded}>
        <Button label={t.redo} icon="refresh" size="lg" block onPress={() => router.push('/tutorial?replay=1' as Href)} />
      </View>
    </Screen>
  );
}

/** The developer panels of the first builds, kept for testing on a device. */
export function LabScreen() {
  const { messages: m } = useI18n();
  const backLabel = useBackLabel();
  const skia = useSkiaReady();
  const { width } = useWindowDimensions();
  const registry = useMemo(() => ProfileRegistry.withBuiltins(), []);
  const samples = useMemo(() => sampleRecordings(), []);
  const [sampleId, setSampleId] = useState<string | null>('circle-cw');
  const [segment, setSegment] = useState<string | null>(null);
  const recording = samples.find((sample) => sample.id === sampleId) ?? null;
  const labUi = useMemo<SigilInterface>(
    () => ({
      sphere: (action) => (action === 'open' ? router.push('/live' as Href) : undefined),
      tutorial: () => router.push('/tutorial?replay=1' as Href),
    }),
    [],
  );
  const stage = Math.max(1, Math.min(width - GUTTER * 2 - 32, 340));

  return (
    <Screen title={m.ui.settings.lab} back={{ label: backLabel }}>
      <Txt variant="callout" tone="secondary" style={styles.caption}>
        {m.ui.settings.labPage.caption}
      </Txt>
      <View style={styles.panels}>
        <Card title={m.home.sphereTitle} caption={m.home.sphereCaption}>
          {skia ? (
            <>
              <SphereStage size={stage} recording={recording} activeSegment={segment} onSelectSegment={setSegment} />
              <SphereQuickActions />
            </>
          ) : (
            <Txt variant="footnote" tone="tertiary">
              {m.ui.settings.labPage.loading}
            </Txt>
          )}
        </Card>
        <GestureLab selectedId={sampleId} onSelect={setSampleId} />
        <PlannerPanel registry={registry} ui={labUi} />
        <ProfilesPanel registry={registry} />
        <SystemPanel />
      </View>
    </Screen>
  );
}

const REPOSITORY = 'https://github.com/kwy404/sigil';

export function AboutScreen() {
  const { messages: m } = useI18n();
  const backLabel = useBackLabel();
  const t = m.ui.settings.aboutPage;
  const runtime = `Expo ${Constants.expoConfig?.sdkVersion ?? '58'} · ${Platform.OS}`;

  return (
    <Screen title={m.ui.settings.about} back={{ label: backLabel }}>
      <ListGroup style={styles.firstGroup}>
        <ListRow title={t.version} icon="info" value={appVersion()} monoValue />
        <ListRow title={t.build} icon="code" value={runtime} monoValue />
      </ListGroup>
      <ListGroup style={styles.group}>
        <ListRow
          title={t.source}
          subtitle="github.com/kwy404/sigil"
          icon="code"
          external
          onPress={() => void WebBrowser.openBrowserAsync(REPOSITORY).catch(() => undefined)}
        />
        <ListRow title={t.licenses} icon="document" chevron onPress={() => router.push('/settings/licenses' as Href)} />
      </ListGroup>
      <Section title={t.privacyTitle}>
        <Txt variant="callout" tone="secondary" style={styles.caption}>
          {t.privacy}
        </Txt>
      </Section>
    </Screen>
  );
}

/** Open source projects in the app and their licenses. Names are proper nouns and stay untranslated. */
const LICENSES: readonly { name: string; license: string }[] = [
  { name: 'Sigil', license: 'MIT' },
  { name: 'Expo, Expo Router and Expo modules', license: 'MIT' },
  { name: 'React and React Native', license: 'MIT' },
  { name: 'React Native Reanimated and Worklets', license: 'MIT' },
  { name: 'React Native Gesture Handler', license: 'MIT' },
  { name: 'React Native Skia', license: 'MIT' },
  { name: 'React Native SVG', license: 'MIT' },
  { name: 'React Native Screens and Safe Area Context', license: 'MIT' },
  { name: 'Zod', license: 'MIT' },
  { name: 'MediaPipe Tasks, hand model and test photos', license: 'Apache 2.0' },
  { name: 'CameraX', license: 'Apache 2.0' },
  { name: 'Sora typeface', license: 'OFL 1.1' },
  { name: 'Inter typeface', license: 'OFL 1.1' },
  { name: 'DM Mono typeface', license: 'OFL 1.1' },
  { name: 'CanvasKit (web build)', license: 'BSD 3 Clause' },
];

export function LicensesScreen() {
  const { messages: m } = useI18n();
  const backLabel = useBackLabel();
  return (
    <Screen title={m.ui.settings.aboutPage.licenses} back={{ label: backLabel }}>
      <Txt variant="callout" tone="secondary" style={styles.caption}>
        {m.ui.settings.aboutPage.licensesCaption}
      </Txt>
      <ListGroup style={styles.group}>
        {LICENSES.map((entry) => (
          <ListRow key={entry.name} title={entry.name} value={entry.license} monoValue />
        ))}
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: { paddingHorizontal: GUTTER, marginTop: 4 },
  block: { marginTop: 24 },
  blockPadded: { marginTop: 24, paddingHorizontal: GUTTER },
  statusCard: {
    marginHorizontal: GUTTER,
    marginTop: 24,
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  panels: { paddingHorizontal: GUTTER, gap: 16, marginTop: 20 },
  firstGroup: { marginTop: 8 },
  group: { marginTop: 24 },
});
