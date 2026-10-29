import { useCallback, useEffect, useState } from 'react';
import { AppState, PermissionsAndroid, Platform, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '../i18n';
import { getNativeControl } from '../system-control';
import { requestControlPermissions } from '../system-control';
import { Button } from '../ui/primitives';
import { tokens } from '../ui/tokens';

interface Readiness {
  accessibility: boolean;
  overlay: boolean;
  camera: boolean;
  microphone: boolean;
  /** Sideloaded on Android 13 or later with the service still off: restricted settings must be allowed first. */
  restricted: boolean;
}

async function readReadiness(): Promise<Readiness | null> {
  const native = getNativeControl();
  if (!native || Platform.OS !== 'android') return null;
  const status = native.getStatus();
  const { PERMISSIONS } = PermissionsAndroid;
  let restricted = false;
  try {
    restricted = !status.accessibilityEnabled && native.getInstallSource().restrictedSettings;
  } catch {
    restricted = false;
  }
  return {
    accessibility: status.accessibilityEnabled,
    overlay: status.overlayPermission,
    camera: await PermissionsAndroid.check(PERMISSIONS.CAMERA),
    microphone: await PermissionsAndroid.check(PERMISSIONS.RECORD_AUDIO),
    restricted,
  };
}

function Item({ label, ok, optional, action, onFix }: { label: string; ok: boolean; optional?: boolean; action: string; onFix: () => void }) {
  const { messages: m } = useI18n();
  const c = m.main.checklist;
  return (
    <View style={styles.item} accessible accessibilityLabel={`${label}: ${ok ? c.ok : optional ? c.optional : action}`}>
      <View style={[styles.dot, { backgroundColor: ok ? tokens.color.success : optional ? tokens.color.textMuted : tokens.color.warning }]} />
      <View style={styles.itemText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.state, { color: ok ? tokens.color.success : tokens.color.textMuted }]}>
          {ok ? c.ok : optional ? c.optional : ''}
        </Text>
      </View>
      {ok ? null : <Button label={action} tone={optional ? 'neutral' : 'warning'} onPress={onFix} />}
    </View>
  );
}

/** What Sigil needs to control other apps, live, with a button to fix each missing piece. */
export function Checklist() {
  const { messages: m } = useI18n();
  const c = m.main.checklist;
  const [ready, setReady] = useState<Readiness | null>(null);

  const refresh = useCallback(() => {
    void readReadiness().then(setReady);
  }, []);

  useEffect(() => {
    refresh();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const native = getNativeControl();
    const subscription = native?.addListener('onServiceStateChanged', refresh);
    return () => {
      appState.remove();
      subscription?.remove();
    };
  }, [refresh]);

  const native = getNativeControl();
  if (!ready || !native) return null;

  const ask = async (microphone: boolean) => {
    if (microphone) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    } else {
      await requestControlPermissions({ microphone: false });
    }
    refresh();
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">
        {c.title}
      </Text>
      {ready.restricted ? (
        <View style={styles.notice}>
          <Item label={c.restricted} ok={false} action={c.fix} onFix={() => native.openAppInfo()} />
          <Text style={styles.noticeText}>{m.system.restricted}</Text>
        </View>
      ) : null}
      <Item label={c.accessibility} ok={ready.accessibility} action={c.fix} onFix={() => native.openAccessibilitySettings()} />
      <Item label={c.overlay} ok={ready.overlay} action={c.fix} onFix={() => native.openOverlaySettings()} />
      <Item label={c.camera} ok={ready.camera} action={c.allow} onFix={() => void ask(false)} />
      <Item label={c.microphone} ok={ready.microphone} optional action={c.allow} onFix={() => void ask(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderColor: tokens.color.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.lg,
    padding: tokens.space.lg,
    gap: tokens.space.md,
  },
  title: { color: tokens.color.text, fontSize: tokens.font.size.title, fontWeight: '600' },
  item: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md, minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  itemText: { flex: 1, gap: 2 },
  label: { color: tokens.color.text, fontSize: 15 },
  state: { fontSize: 12 },
  notice: { gap: tokens.space.sm, borderColor: tokens.color.warning, borderWidth: 1, borderRadius: tokens.radius.md, padding: tokens.space.md },
  noticeText: { color: tokens.color.textMuted, fontSize: 13, lineHeight: 18 },
});
