import { Redirect, Tabs, type Href } from 'expo-router';

import { useFeedRecorder } from '@/history/store';
import { usePreferences } from '@/preferences/provider';
import { BottomChrome } from '@/screens/chrome/bottom-chrome';
import { color } from '@/ui/theme';

export default function TabsLayout() {
  const { ready, needsTour } = usePreferences();
  useFeedRecorder();

  if (!ready) {
    return null;
  }
  if (needsTour) {
    return <Redirect href={'/welcome' as Href} />;
  }

  return (
    <Tabs
      tabBar={(props) => <BottomChrome {...props} />}
      screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: color.canvas } }}>
      <Tabs.Screen name="(now)" />
      <Tabs.Screen name="(gestures)" />
      <Tabs.Screen name="(apps)" />
      <Tabs.Screen name="(voice)" />
      <Tabs.Screen name="(settings)" />
    </Tabs>
  );
}
