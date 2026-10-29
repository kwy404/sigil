import type { SessionState } from '../session/types';

/**
 * What Sigil did recently, kept in memory on the phone: gestures it acted on
 * and spoken requests with their outcome. The Now and Voice tabs read it.
 */
export type CommandOutcome = NonNullable<SessionState['lastCommand']>['outcome'];

export type FeedEntry =
  | { kind: 'gesture'; id: string; key: string; at: number }
  | { kind: 'command'; id: string; text: string; outcome: CommandOutcome; at: number };

export const FEED_LIMIT = 40;

/** Adds an entry at the top, once per id, keeping at most FEED_LIMIT. */
export function pushEntry(feed: readonly FeedEntry[], entry: FeedEntry, limit = FEED_LIMIT): FeedEntry[] {
  if (feed.some((item) => item.id === entry.id)) {
    return [...feed];
  }
  return [entry, ...feed].slice(0, limit);
}

/** The entry a session change adds, if any: a new last command, or a new last gesture. */
export function entriesFromChange(
  previous: Pick<SessionState, 'lastGesture' | 'lastCommand'> | null,
  next: Pick<SessionState, 'lastGesture' | 'lastCommand'>,
  now: number,
): FeedEntry[] {
  const out: FeedEntry[] = [];
  const command = next.lastCommand;
  if (command && command.text.trim().length > 0 && command.at !== previous?.lastCommand?.at) {
    out.push({ kind: 'command', id: `command-${command.at}`, text: command.text, outcome: command.outcome, at: command.at });
  }
  if (next.lastGesture && next.lastGesture !== previous?.lastGesture) {
    out.push({ kind: 'gesture', id: `gesture-${now}-${next.lastGesture}`, key: next.lastGesture, at: now });
  }
  return out;
}

export type Recency = { unit: 'now' } | { unit: 'minutes'; value: number } | { unit: 'hours'; value: number } | { unit: 'days'; value: number };

/** How long ago something happened, in the coarse steps a feed shows. */
export function recency(at: number, now: number): Recency {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return { unit: 'now' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { unit: 'minutes', value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', value: hours };
  return { unit: 'days', value: Math.floor(hours / 24) };
}
