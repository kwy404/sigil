import { Redirect, router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';

import { getSigil, openControlSphere, sessionActions } from '@/session';

/**
 * Links from outside the app: the Quick Settings tile, the home screen widget,
 * the bubble and the notification open sigil://control/start, stop, sphere,
 * home or demo. The demo hand never taps, so the link is safe to expose; the
 * emulator smoke test uses it because it has no real hand. selftest runs the
 * hand tracker on MediaPipe's test photos and shows the diagnostics page.
 */
export default function ControlLink() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (action === 'start') await sessionActions.start();
      if (action === 'stop') sessionActions.stop();
      if (action === 'demo') await getSigil().startDemo();
      if (action === 'selftest') {
        if (getSigil().current.running === false) await sessionActions.start();
        if (cancelled) return;
        router.replace('/settings/diagnostics' as Href);
        void getSigil().runSelfTest();
        return;
      }
      if (cancelled) return;
      // The bubble opens the sphere: the screen the screens registered, or home.
      if (action === 'sphere') openControlSphere();
      else setDone(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [action]);

  if (!done) return null;
  return <Redirect href="/" />;
}
