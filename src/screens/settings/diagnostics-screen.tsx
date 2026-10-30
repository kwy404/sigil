import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { allowBackground, copyReport, diagnosticsReport, stageLabel, useDiagnostics } from '../../diagnostics';
import { useI18n } from '../../i18n';
import type { SelfTestVerdict } from '../../runtime/self-test';
import { getSigil, useSigilSession } from '../../session';
import { Button } from '../../ui/button';
import { StatusChip } from '../../ui/chip';
import { ListGroup, ListRow } from '../../ui/list';
import { Screen } from '../../ui/screen';
import { color, continuous, GUTTER, type StatusTone } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { useBackLabel } from '../shared';

/** A per second figure: green while frames flow, amber when the stage is idle. */
function flow(rate: number): StatusTone {
  return rate > 0 ? 'success' : 'warning';
}

/**
 * Settings, Diagnostics: every stage of the hand tracker live, the phone and
 * its accesses, the self test on MediaPipe's own photos of hands, and a plain
 * text report to copy.
 */
export function DiagnosticsScreen() {
  const { messages: m } = useI18n();
  const backLabel = useBackLabel();
  const session = useSigilSession();
  const d = useDiagnostics();
  const t = m.ui.diagnostics;
  const [verdict, setVerdict] = useState<SelfTestVerdict | null>(() => getSigil().current.selfTest);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState(false);

  // The self test may also start from sigil://control/selftest; follow the runtime's last verdict.
  useEffect(() => {
    const unsubscribe = getSigil().subscribe((state) => setVerdict(state.selfTest));
    return () => {
      unsubscribe();
    };
  }, []);

  const runTest = async () => {
    setTesting(true);
    try {
      setVerdict(await getSigil().runSelfTest());
    } finally {
      setTesting(false);
    }
  };

  const copy = async () => {
    const text = diagnosticsReport(d, session, verdict, m);
    setCopied(await copyReport(text, t.reportTitle));
  };

  if (!d) {
    return (
      <Screen title={t.title} back={{ label: backLabel }}>
        <Txt variant="callout" tone="secondary" style={styles.caption}>
          {t.androidOnly}
        </Txt>
      </Screen>
    );
  }

  const tr = d.tracker;
  const js = getSigil().jsStats;
  const running = testing || tr.selfTestRunning;
  const photos = verdict?.photos ?? [];
  const withHands = photos.filter((photo) => photo.hands > 0).length;
  const seconds = Math.round(Number((tr.selfTest as { totalMs?: number } | null)?.totalMs ?? 0) / 1000);

  return (
    <Screen title={t.title} back={{ label: backLabel }}>
      <Txt variant="callout" tone="secondary" style={styles.caption}>
        {t.caption}
      </Txt>

      <ListGroup header={t.tracker} style={styles.group}>
        <ListRow title={t.cameraFrames} icon="camera-tracking" value={t.perSecond(tr.cameraFps)} status={flow(tr.cameraFps)} />
        <ListRow title={t.sentFrames} icon="layers" value={t.perSecond(tr.sentFps)} status={flow(tr.sentFps)} />
        <ListRow title={t.results} icon="thinking" value={t.perSecond(tr.resultFps)} status={flow(tr.resultFps)} />
        <ListRow title={t.hands} icon="gesture-open-palm" value={t.perSecond(tr.handFps)} status={flow(tr.handFps)} />
        <ListRow title={t.convert} icon="grid" value={t.ms(Math.round(tr.convertMs))} monoValue />
        <ListRow title={t.inference} icon="on-device-model" value={t.ms(Math.round(tr.inferenceMs))} monoValue />
        <ListRow title={t.delivery} icon="layers" value={t.ms(Math.round(tr.deliveryMs * 10) / 10)} monoValue />
        <ListRow title={t.js} icon="code" value={t.ms(Math.round(js.handleMs * 10) / 10)} monoValue />
        <ListRow title={t.cursorRate} icon="cursor" value={t.perSecond(tr.cursorFps)} status={flow(tr.cursorFps)} />
        <ListRow title={t.endToEnd} icon="clock" value={t.ms(Math.round(tr.endToEndMs))} monoValue />
        <ListRow title={t.engine} icon="sliders" value={`${tr.delegate} ${tr.inputSize}`} monoValue />
        <ListRow
          title={t.model}
          icon="on-device-model"
          value={tr.modelLoaded ? t.modelLoaded(Math.round(tr.modelLoadMs)) : t.modelNotLoaded}
          status={tr.modelLoaded ? 'success' : 'warning'}
        />
        <ListRow title={t.camera} icon="cursor" value={`${tr.cameraId ?? '-'} ${tr.cameraState ?? ''}`.trim()} monoValue />
        <ListRow title={t.frame} icon="grid" subtitle={t.frameSize(tr.frameWidth, tr.frameHeight, tr.rotationDegrees)} />
        <ListRow title={t.lifecycle} icon="clock" value={d.lifecycle} monoValue />
        <ListRow
          title={t.lastError}
          icon="info"
          iconTone={tr.lastError ? 'danger' : 'success'}
          value={stageLabel(tr.lastErrorStage, m)}
          subtitle={tr.lastError ?? undefined}
        />
      </ListGroup>

      <View style={[styles.card, continuous]}>
        <Txt variant="headline">{t.selfTest}</Txt>
        <Txt variant="footnote" tone="secondary">
          {t.selfTestCaption}
        </Txt>
        {running || verdict ? (
          <View style={styles.result}>
            <StatusChip
              tone={running ? 'accent' : verdict?.passed ? 'success' : 'danger'}
              label={running ? t.testing : verdict?.passed ? t.passed : t.failed}
              live={running}
            />
            {!running && verdict ? (
              <Txt variant="mono" tone="tertiary">
                {t.selfTestSummary(withHands, photos.length, seconds)}
              </Txt>
            ) : null}
          </View>
        ) : null}
        <Button label={t.selfTest} icon="calibrate" variant="tinted" block loading={running} disabled={running} onPress={() => void runTest()} />
      </View>

      <ListGroup header={t.phone} style={styles.group}>
        <ListRow title={t.phone} icon="info" value={`${d.manufacturer} ${d.model}`} />
        <ListRow title={t.android} icon="code" value={`${d.androidVersion} (SDK ${d.sdkInt})`} monoValue />
        <ListRow title={t.accessibility} icon="accessibility" value={d.accessibilityEnabled ? t.on : t.off} status={d.accessibilityEnabled ? 'success' : 'warning'} />
        <ListRow title={t.overlay} icon="layers" value={d.overlayPermission ? t.on : t.off} status={d.overlayPermission ? 'success' : 'warning'} />
        <ListRow
          title={t.service}
          icon="camera-tracking"
          value={d.serviceRunning ? (d.servicePaused ? t.paused : t.running) : t.stopped}
          status={d.serviceRunning && !d.servicePaused ? 'success' : 'neutral'}
        />
        <ListRow title={t.battery} icon="battery-saver" value={d.batteryOptimized ? t.batteryOn : t.batteryOff} status={d.batteryOptimized ? 'warning' : 'success'} />
        {d.batteryOptimized ? <ListRow title={t.batteryFix} icon="battery-saver" action chevron onPress={() => void allowBackground()} /> : null}
      </ListGroup>

      <View style={styles.actions}>
        <Button label={copied ? t.copied : t.copy} icon="document" variant="secondary" block onPress={() => void copy()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: { paddingHorizontal: GUTTER, marginTop: 4 },
  group: { marginTop: 24 },
  card: {
    marginHorizontal: GUTTER,
    marginTop: 24,
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  actions: { paddingHorizontal: GUTTER, marginTop: 24, marginBottom: 8 },
});
