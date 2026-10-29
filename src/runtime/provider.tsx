import { useRouter } from 'expo-router';
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { useI18n } from '../i18n';
import type { VoiceState } from '../voice/session';
import { Sigil, type SigilState } from './sigil';

const SigilContext = createContext<Sigil | null>(null);

/** Creates the one Sigil runtime of the app and keeps it for every screen. */
export function SigilProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { speechLocale } = useI18n();
  const locale = useRef(speechLocale);
  locale.current = speechLocale;
  const [sigil] = useState(
    () =>
      new Sigil({
        openSphere: () => router.navigate('/sphere'),
        openTutorial: () => router.push('/tutorial?replay=1'),
        locale: () => locale.current,
      }),
  );
  useEffect(() => () => sigil.dispose(), [sigil]);
  return <SigilContext.Provider value={sigil}>{children}</SigilContext.Provider>;
}

export function useSigil(): Sigil {
  const sigil = useContext(SigilContext);
  if (!sigil) throw new Error('useSigil needs SigilProvider.');
  return sigil;
}

export function useSigilState(): SigilState {
  const sigil = useSigil();
  return useSyncExternalStore(
    (listener) => sigil.subscribe(listener),
    () => sigil.current,
  );
}

export function useVoiceState(): VoiceState {
  const sigil = useSigil();
  return useSyncExternalStore(
    (listener) => sigil.voice.subscribe(listener),
    () => sigil.voice.current,
  );
}
