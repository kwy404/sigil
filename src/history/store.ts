import { useEffect, useRef, useSyncExternalStore } from 'react';

import { useSigilSession } from '../session';
import type { SessionState } from '../session/types';
import { entriesFromChange, pushEntry, type FeedEntry } from './feed';

let feed: FeedEntry[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function add(entries: FeedEntry[]): void {
  if (entries.length === 0) return;
  for (const entry of entries) feed = pushEntry(feed, entry);
  listeners.forEach((listener) => listener());
}

/** The recent activity, newest first. */
export function useFeed(): readonly FeedEntry[] {
  return useSyncExternalStore(
    subscribe,
    () => feed,
    () => feed,
  );
}

/** Mounted once under the tabs: turns session changes into feed entries. */
export function useFeedRecorder(): void {
  const session = useSigilSession();
  const previous = useRef<Pick<SessionState, 'lastGesture' | 'lastCommand'> | null>(null);
  const { lastGesture, lastCommand } = session;

  useEffect(() => {
    const next = { lastGesture, lastCommand };
    add(entriesFromChange(previous.current, next, Date.now()));
    previous.current = next;
  }, [lastGesture, lastCommand]);
}
