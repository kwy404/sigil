import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

import { DEFAULT_CONTROL_BOX, mapToScreen, sampleRecordings, traceRecording } from '../gesture-engine';
import {
  describeMode,
  getNativeControl,
  getSystemControl,
  requestControlPermissions,
  type SystemControl,
} from '../system-control';
import { Button, Card, Chip, Row, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';

const MODE_LABEL: Record<SystemControl['mode'], string> = {
  'android-system': 'system wide',
  'android-setup': 'setup needed',
  'in-app': 'in app only',
};

/** Shows what this build can control and, on Android, the switches to turn system control on. */
export function SystemPanel() {
  const [control, setControl] = useState(() => getSystemControl());
  const [status, setStatus] = useState(() => control.native?.getStatus() ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const demo = useRef<ReturnType<typeof setInterval> | null>(null);
  const native = control.native;

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
            if (event.error) setMessage(`Camera service: ${event.error}`);
            refresh();
          }),
        ]
      : [];
    return () => {
      appState.remove();
      subscriptions.forEach((s) => s.remove());
      if (demo.current) clearInterval(demo.current);
    };
  }, [refresh]);

  const startCamera = async () => {
    if (!native) return;
    const granted = await requestControlPermissions({ microphone: false });
    if (!granted.camera) {
      setMessage('Gesture control needs the camera permission.');
      return;
    }
    if (!native.startCameraService(false)) {
      setMessage('The camera service could not start.');
    }
    refresh();
  };

  const cursorDemo = () => {
    if (!native) return;
    if (!native.showCursor()) {
      setMessage('Turn on the accessibility service, or allow Sigil to display over other apps, to see the cursor.');
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
      title="System control"
      caption={describeMode(control.mode)}
      right={<Chip label={MODE_LABEL[control.mode]} tone={control.mode === 'android-system' ? 'success' : 'warning'} />}>
      {native && status ? (
        <>
          <View style={styles.rows}>
            <Row label="Accessibility service" value={status.accessibilityEnabled ? 'on' : 'off'} tone={status.accessibilityEnabled ? 'success' : 'warning'} />
            <Row label="Camera service" value={status.cameraServiceRunning ? 'running' : 'stopped'} />
            <Row label="Display over other apps" value={status.overlayPermission ? 'allowed' : 'not allowed'} />
            <Row label="App in front" value={status.foregroundPackage ?? 'unknown'} />
          </View>
          <View style={styles.buttons}>
            <Button label="Open accessibility settings" onPress={() => native.openAccessibilitySettings()} />
            {status.cameraServiceRunning ? (
              <Button label="Stop camera service" tone="warning" onPress={() => { native.stopCameraService(); refresh(); }} />
            ) : (
              <Button label="Start camera service" onPress={startCamera} />
            )}
            <Button label="Show the cursor over apps" onPress={cursorDemo} />
          </View>
          <Text style={textStyles.muted}>
            On Android 13 and later, a build installed outside the Play Store must first allow restricted settings in
            App info before its accessibility service can be turned on.
          </Text>
        </>
      ) : (
        <Text style={textStyles.muted}>
          {Platform.OS === 'ios'
            ? 'On iOS, Sigil reads gestures and voice inside its own screens, opens apps through links and runs Shortcuts. It cannot tap or draw inside other apps.'
            : 'Build a development client with EAS to include the Android control module. Expo Go only has the JavaScript side.'}
        </Text>
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
