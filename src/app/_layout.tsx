import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

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
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: tokens.color.background } }} />
    </ThemeProvider>
  );
}
