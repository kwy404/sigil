import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ControlSphere, DEFAULT_SEGMENTS } from '@/control-sphere';
import { SphereQuickActions } from '@/features/sphere-quick-actions';
import { useI18n } from '@/i18n';
import { useSigil, useSigilState } from '@/runtime/provider';
import { getNativeControl, useInstalledApps } from '@/system-control';
import { Button, textStyles } from '@/ui/primitives';
import { tokens } from '@/ui/tokens';

/**
 * The Control Sphere, opened from the floating bubble, an open palm or a voice
 * request: apps, voice, cursor, profiles, pause and settings around a breathing
 * core, with the volume and brightness rings below.
 */
export default function Sphere() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const { messages: m } = useI18n();
  const sigil = useSigil();
  const state = useSigilState();
  const apps = useInstalledApps();
  const [active, setActive] = useState<string | null>(null);
  const segments = useMemo(() => DEFAULT_SEGMENTS.map((segment) => ({ id: segment.id, label: m.sphere.segments[segment.id] })), [m]);
  const size = Math.min(width - 2 * tokens.space.xl, 340);

  const select = (id: string) => {
    setActive(id);
    switch (id) {
      case 'voice':
        router.back();
        void sigil.voice.start();
        break;
      case 'cursor':
        void (state.demo ? sigil.stopDemo() : sigil.startDemo());
        break;
      case 'profiles':
        router.push('/lab');
        break;
      case 'pause':
        sigil.pause(!state.paused);
        break;
      case 'settings':
        router.push('/settings');
        break;
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + tokens.space.lg, paddingBottom: insets.bottom + tokens.space.xxl }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {m.sphereScreen.title}
          </Text>
          <Text style={textStyles.muted}>{m.sphereScreen.caption}</Text>
        </View>
        <Button label={m.sphereScreen.done} tone="neutral" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <View style={styles.sphere}>
        <ControlSphere size={size} segments={segments} activeId={active} onSelect={select} />
      </View>
      {active === 'apps' ? (
        <View style={styles.apps}>
          {apps.slice(0, 40).map((app) => (
            <Pressable
              key={`${app.packageName}-${app.label}`}
              accessibilityRole="button"
              onPress={() => void getNativeControl()?.openApp(app.packageName, null, null)}
              style={({ pressed }) => [styles.app, pressed ? styles.pressed : null]}>
              <Text style={styles.appText} numberOfLines={1}>
                {app.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <SphereQuickActions />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background },
  content: { paddingHorizontal: tokens.space.xl, gap: tokens.space.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.md },
  headerText: { flex: 1, gap: tokens.space.xs },
  title: { color: tokens.color.text, fontSize: 28, fontWeight: '700' },
  sphere: { alignItems: 'center' },
  apps: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  app: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surfaceRaised,
    maxWidth: '48%',
  },
  appText: { color: tokens.color.text, fontSize: 14 },
  pressed: { opacity: 0.7 },
});
