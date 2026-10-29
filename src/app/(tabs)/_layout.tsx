import { Redirect, router, Tabs, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useFeedRecorder } from '@/history/store';
import { usePreferences } from '@/preferences/provider';
import { BottomChrome } from '@/screens/chrome/bottom-chrome';
import { setSessionHandlers } from '@/session';
import { color } from '@/ui/theme';

export default function TabsLayout() {
  const { ready, needsTour } = usePreferences();
  useFeedRecorder();

  // The bubble, the tile and the voice command open the Live sheet and the tour through the session.
  useEffect(() => {
    setSessionHandlers({
      openSphere: () => router.push('/live' as Href),
      openTutorial: () => router.push('/tutorial?replay=1' as Href),
    });
  }, []);

  if (!ready) {
    return null;
  }
  if (needsTour) {
    return <Redirect href={'/tutorial' as Href} />;
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
