import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { useSigil } from '@/runtime/provider';

/**
 * Links from outside the app: the Quick Settings tile, the home screen widget,
 * the bubble and the notification open sigil://control/start, stop, sphere,
 * home or demo. The demo hand never taps, so the link is safe to expose; the
 * emulator smoke test uses it because it has no real hand.
 */
export default function ControlLink() {
  const { action } = useLocalSearchParams<{ action: string }>();
  const sigil = useSigil();
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (action === 'start') await sigil.start();
      if (action === 'stop') sigil.stop();
      if (action === 'demo') await sigil.startDemo();
      if (!cancelled) setDone(true);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [action, sigil]);

  if (!done) return null;
  return <Redirect href={action === 'sphere' ? '/sphere' : '/'} />;
}
