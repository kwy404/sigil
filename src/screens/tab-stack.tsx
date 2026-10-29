import { Stack } from 'expo-router';

import { color } from '../ui/theme';

/** The stack inside each tab: pages push with the native transition and keep the tab bar. */
export function TabStack() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />;
}
