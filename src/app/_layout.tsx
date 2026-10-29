import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { I18nProvider } from '@/i18n';
import { SigilProvider } from '@/runtime/provider';
import { tokens } from '@/ui/tokens';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: tokens.color.accent,
    background: tokens.color.background,
    card: tokens.color.surface,
    text: tokens.color.text,
    border: tokens.color.border,
  },
};

export default function RootLayout() {
  return (
    <I18nProvider>
      <SigilProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.color.background } }} />
        </ThemeProvider>
      </SigilProvider>
    </I18nProvider>
  );
}
