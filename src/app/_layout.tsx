import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { I18nProvider } from '@/i18n';
import { PreferencesProvider } from '@/preferences/provider';
import { useBrandFonts } from '@/ui/fonts';
import { color } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync().catch(() => undefined);

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: color.accent,
    background: color.canvas,
    card: color.surface,
    text: color.text,
    border: color.hairlineStrong,
  },
};

/** Sheets that draw their own panel over the tabs. */
const SHEET = {
  presentation: 'transparentModal',
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
} as const;

export default function RootLayout() {
  const fonts = useBrandFonts();

  useEffect(() => {
    if (fonts) void SplashScreen.hideAsync().catch(() => undefined);
  }, [fonts]);

  if (!fonts) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <I18nProvider>
        <PreferencesProvider>
          <ThemeProvider value={theme}>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="live" options={SHEET} />
              <Stack.Screen name="command" options={SHEET} />
              <Stack.Screen name="welcome" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
            </Stack>
          </ThemeProvider>
        </PreferencesProvider>
      </I18nProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
});
