import { useEffect, useState } from 'react';
import { AppState, Platform, Share } from 'react-native';

import type { DiagnosticsSnapshot, TrackerSnapshot } from '../../modules/sigil-control';
import type { Messages } from '../i18n';
import type { SelfTestVerdict } from '../runtime/self-test';
import type { SessionState } from '../session/types';
import { getNativeControl } from '../system-control/native';

export type { DiagnosticsSnapshot, TrackerSnapshot } from '../../modules/sigil-control';

/** The diagnostics of the Android module, or null where it does not exist. */
export function readDiagnostics(): DiagnosticsSnapshot | null {
  const native = getNativeControl();
  if (!native || Platform.OS !== 'android') return null;
  try {
    return native.getDiagnostics();
  } catch {
    return null;
  }
}

/** The diagnostics, read again every second while a screen shows them and the app is in front. */
export function useDiagnostics(intervalMs = 1000): DiagnosticsSnapshot | null {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(readDiagnostics);
  useEffect(() => {
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') setSnapshot(readDiagnostics());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return snapshot;
}

/** The stage of an error in words; self test stages share one label, unknown ones stay as the code. */
export function stageLabel(stage: string | null, m: Messages): string {
  if (!stage) return m.ui.diagnostics.none;
  const stages = m.ui.diagnostics.stages as Record<string, string>;
  if (stages[stage]) return stages[stage];
  if (stage.startsWith('selftest')) return stages.selftest;
  return stage;
}

/** Where the frames stop, the first stage with nothing coming out of it, for a one line summary. */
export function stuckStage(tracker: TrackerSnapshot | null | undefined): 'model' | 'camera' | 'tracker' | 'hand' | null {
  if (!tracker || tracker.pipeline === 'none') return null;
  if (!tracker.modelLoaded) return 'model';
  if (tracker.cameraFps === 0) return 'camera';
  if (tracker.resultFps === 0) return 'tracker';
  if (tracker.handFps === 0) return 'hand';
  return null;
}

function onOff(value: boolean, m: Messages): string {
  return value ? m.ui.diagnostics.on : m.ui.diagnostics.off;
}

/**
 * The report the user can copy and paste: plain text with the labels in the
 * app language and the values as the phone reports them, so it reads for the
 * user and for whoever helps.
 */
export function diagnosticsReport(
  d: DiagnosticsSnapshot | null,
  session: Pick<SessionState, 'phase' | 'hand' | 'lastGesture' | 'checklist'>,
  verdict: SelfTestVerdict | null,
  m: Messages,
  now = Date.now(),
): string {
  const t = m.ui.diagnostics;
  const lines: string[] = [t.reportTitle, new Date(now).toISOString()];
  if (!d) {
    lines.push(t.androidOnly);
    return lines.join('\n');
  }
  const tr = d.tracker;
  const missing = (Object.entries(session.checklist) as [string, boolean][]).filter(([, ready]) => !ready).map(([item]) => item);
  lines.push(
    '',
    `${t.phone}: ${d.manufacturer} ${d.model}, ${d.abi}`,
    `${t.android}: ${d.androidVersion} (SDK ${d.sdkInt}), Sigil ${d.appVersion}`,
    `${t.accessibility}: ${onOff(d.accessibilityEnabled, m)}`,
    `${t.overlay}: ${onOff(d.overlayPermission, m)}`,
    `${t.battery}: ${d.batteryOptimized ? t.batteryOn : t.batteryOff}`,
    `${t.service}: ${d.serviceRunning ? (d.servicePaused ? t.paused : t.running) : t.stopped}, ${d.lifecycle}`,
    `Sigil: ${session.phase} · ${session.hand} · ${session.lastGesture ?? '-'} · ${missing.length > 0 ? missing.join(' ') : '-'}`,
    '',
    `${t.tracker}: ${tr.pipeline}`,
    `${t.model}: ${tr.modelLoaded ? t.modelLoaded(Math.round(tr.modelLoadMs)) : t.modelNotLoaded}`,
    `${t.camera}: ${tr.cameraId ?? '-'} ${tr.cameraState ?? '-'}`,
    `${t.frame}: ${t.frameSize(tr.frameWidth, tr.frameHeight, tr.rotationDegrees)} (${tr.targetRotation})`,
    `${t.cameraFrames}: ${t.perSecond(tr.cameraFps)} (${tr.cameraFrames})`,
    `${t.sentFrames}: ${t.perSecond(tr.sentFps)} (${tr.sentFrames})`,
    `${t.results}: ${t.perSecond(tr.resultFps)} (${tr.results})`,
    `${t.hands}: ${t.perSecond(tr.handFps)} (${tr.handsFound})`,
    `${t.convert} ${t.ms(Math.round(tr.convertMs))} · ${t.inference} ${t.ms(Math.round(tr.inferenceMs))} · ${t.delivery} ${t.ms(Math.round(tr.deliveryMs))}`,
    `${t.cursorRate}: ${t.perSecond(tr.cursorFps)} · ${t.endToEnd} ${t.ms(Math.round(tr.endToEndMs))} · ${t.engine} ${tr.delegate} ${tr.inputSize}`,
    `${t.lastError}: ${tr.lastError ? `${stageLabel(tr.lastErrorStage, m)} [${tr.lastErrorStage}] ${tr.lastError}` : t.none}`,
  );
  if (verdict) {
    lines.push('', `${t.selfTest}: ${verdict.passed ? t.passed : t.failed}`);
    for (const photo of verdict.photos) {
      lines.push(`  ${photo.name}: ${photo.hands} · ${photo.pose ?? '-'} · ${photo.travel} px${photo.ok ? '' : ` · ${photo.problems.join('; ')}`}`);
    }
    for (const problem of verdict.problems.filter((p) => !verdict.photos.some((photo) => p.startsWith(photo.name)))) {
      lines.push(`  ${problem}`);
    }
  }
  return lines.join('\n');
}

/** Copies the report on Android; elsewhere it opens the share sheet. */
export async function copyReport(text: string, label: string): Promise<boolean> {
  const native = getNativeControl();
  if (native && Platform.OS === 'android') return native.copyText(label, text);
  try {
    await Share.share({ message: text });
    return true;
  } catch {
    return false;
  }
}

/** Opens the Android screen that takes Sigil out of battery optimization. */
export function allowBackground(): boolean {
  const native = getNativeControl();
  return native !== null && Platform.OS === 'android' ? native.requestIgnoreBatteryOptimizations() : false;
}
