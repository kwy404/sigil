import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LanguagePanel } from '@/features/language-panel';
import { useI18n } from '@/i18n';
import { useSigil, useSigilState } from '@/runtime/provider';
import { readSettings, updateSettings } from '@/settings/store';
import { Button, Card } from '@/ui/primitives';
import { tokens } from '@/ui/tokens';

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: tokens.color.border, true: tokens.color.accentDeep }}
        thumbColor={value ? tokens.color.accent : tokens.color.textMuted}
      />
    </View>
  );
}

/** Voice, speech recognition, language, the guided tour and the lab. */
export default function Settings() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { messages: m } = useI18n();
  const sigil = useSigil();
  const state = useSigilState();
  const s = m.settingsScreen;
  const [offDevice, setOffDevice] = useState(() => readSettings().speech?.allowOffDevice === true);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + tokens.space.lg, paddingBottom: insets.bottom + tokens.space.xxl }]}>
      <Text style={styles.title} accessibilityRole="header">
        {s.title}
      </Text>
      <Card title={m.main.voice.title}>
        <Toggle label={m.main.voice.microphone} value={state.microphone} onChange={(value) => void sigil.setMicrophone(value)} />
      </Card>
      <Card title={s.speechTitle} caption={s.offDeviceCaption}>
        <Toggle
          label={s.allowOffDevice}
          value={offDevice}
          onChange={(value) => {
            setOffDevice(value);
            updateSettings({ speech: { allowOffDevice: value } });
          }}
        />
      </Card>
      <LanguagePanel />
      <Card title={m.tutorial.label} caption={m.tutorial.redoCaption}>
        <Button label={m.tutorial.redo} onPress={() => router.push('/tutorial?replay=1')} />
      </Card>
      <Card title={s.lab} caption={s.labCaption}>
        <Button label={s.open} tone="neutral" onPress={() => router.push('/lab')} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { paddingHorizontal: tokens.space.xl, gap: tokens.space.lg },
  title: { color: tokens.color.text, fontSize: 28, fontWeight: '700' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md, minHeight: 44 },
  toggleLabel: { flex: 1, color: tokens.color.text, fontSize: 15 },
});
