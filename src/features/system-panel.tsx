import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_CONTROL_BOX, mapToScreen, sampleRecordings, traceRecording } from '../gesture-engine';
import { useI18n, type Messages } from '../i18n';
import { getNativeControl, getSystemControl, requestControlPermissions, type ControlMode } from '../system-control';
import { Button, Card, Chip, Row, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';

function modeText(mode: ControlMode, m: Messages): string {
  if (mode === 'in-app') {
    return Platform.OS === 'ios' ? m.system.modes.inAppIos : m.system.modes.inAppOther;
  }
  return m.system.modes[mode];
}

/** Shows what this build can control and, on Android, the switches to turn system control on. */
export function SystemPanel() {
  const { messages: m } = useI18n();
  const [control, setControl] = useState(() => getSystemControl());
  const [status, setStatus] = useState(() => control.native?.getStatus() ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const demo = useRef<ReturnType<typeof setInterval> | null>(null);
  const native = control.native;
  const v = m.system.values;

  const refresh = useCallback(() => {
    const next = getSystemControl();
    setControl(next);
    setStatus(next.native?.getStatus() ?? null);
  }, []);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const module = getNativeControl();
    const subscriptions = module
      ? [
          module.addListener('onServiceStateChanged', refresh),
          module.addListener('onForegroundAppChanged', refresh),
          module.addListener('onCameraServiceStateChanged', (event) => {
            if (event.error) setMessage(m.system.errors.cameraService(event.error));
            refresh();
          }),
        ]
      : [];
    return () => {
      appState.remove();
      subscriptions.forEach((s) => s.remove());
      if (demo.current) clearInterval(demo.current);
    };
  }, [refresh, m]);

  const startCamera = async () => {
    if (!native) return;
    const granted = await requestControlPermissions({ microphone: false });
    if (!granted.camera) {
      setMessage(m.system.errors.cameraPermission);
      return;
    }
    if (!native.startCameraService(false)) {
      setMessage(m.system.errors.cameraStart);
    }
    refresh();
  };

  const cursorDemo = () => {
    if (!native) return;
    if (!native.showCursor()) {
      setMessage(m.system.errors.cursor);
      native.openOverlaySettings();
      return;
    }
    const screen = native.getScreenSize();
    const circle = sampleRecordings().find((r) => r.id === 'circle-cw');
    const points = circle ? traceRecording(circle).points : [];
    let index = 0;
    if (demo.current) clearInterval(demo.current);
    demo.current = setInterval(() => {
      const point = points[index];
      if (point?.cursor) {
        const position = mapToScreen(point.cursor, DEFAULT_CONTROL_BOX, screen);
        native.moveCursor(position.x, position.y, point.pinching ? 'press' : 'hover');
      }
      index++;
      if (index >= points.length) {
        if (demo.current) clearInterval(demo.current);
        demo.current = null;
        setTimeout(() => native.hideCursor(), 600);
      }
    }, 33);
  };

  return (
    <Card
      title={m.system.title}
      caption={modeText(control.mode, m)}
      right={<Chip label={m.system.modeLabels[control.mode]} tone={control.mode === 'android-system' ? 'success' : 'warning'} />}>
      {native && status ? (
        <>
          <View style={styles.rows}>
            <Row
              label={m.system.rows.accessibility}
              value={status.accessibilityEnabled ? v.on : v.off}
              tone={status.accessibilityEnabled ? 'success' : 'warning'}
            />
            <Row label={m.system.rows.camera} value={status.cameraServiceRunning ? v.running : v.stopped} />
            <Row label={m.system.rows.overlay} value={status.overlayPermission ? v.allowed : v.notAllowed} />
            <Row label={m.system.rows.foreground} value={status.foregroundPackage ?? v.unknown} />
          </View>
          <View style={styles.buttons}>
            <Button label={m.system.buttons.accessibility} onPress={() => native.openAccessibilitySettings()} />
            {status.cameraServiceRunning ? (
              <Button
                label={m.system.buttons.stopCamera}
                tone="warning"
                onPress={() => {
                  native.stopCameraService();
                  refresh();
                }}
              />
            ) : (
              <Button label={m.system.buttons.startCamera} onPress={startCamera} />
            )}
            <Button label={m.system.buttons.cursor} onPress={cursorDemo} />
          </View>
          <Text style={textStyles.muted}>{m.system.restricted}</Text>
        </>
      ) : (
        <Text style={textStyles.muted}>{Platform.OS === 'ios' ? m.system.iosOnly : m.system.devClient}</Text>
      )}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  rows: { gap: tokens.space.sm },
  buttons: { gap: tokens.space.sm },
  message: { color: tokens.color.warning, fontSize: 13 },
});
