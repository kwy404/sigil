import { describe, expect, it } from '@jest/globals';

import { entriesFromChange, FEED_LIMIT, pushEntry, recency, type FeedEntry } from '../feed';

const gesture = (id: string, at = 0): FeedEntry => ({ kind: 'gesture', id, key: 'pinch', at });

describe('feed', () => {
  it('adds new entries at the top and keeps each id once', () => {
    let feed: FeedEntry[] = [];
    feed = pushEntry(feed, gesture('a'));
    feed = pushEntry(feed, gesture('b'));
    feed = pushEntry(feed, gesture('a'));
    expect(feed.map((entry) => entry.id)).toEqual(['b', 'a']);
  });

  it('keeps at most the limit, dropping the oldest', () => {
    let feed: FeedEntry[] = [];
    for (let i = 0; i < FEED_LIMIT + 5; i++) feed = pushEntry(feed, gesture(`g${i}`));
    expect(feed).toHaveLength(FEED_LIMIT);
    expect(feed[0].id).toBe(`g${FEED_LIMIT + 4}`);
  });

  it('records a new command once, by its time, and skips empty transcripts', () => {
    const command = { text: 'open YouTube', at: 10, outcome: 'done' as const };
    const first = entriesFromChange(null, { lastGesture: null, lastCommand: command }, 100);
    expect(first).toEqual([{ kind: 'command', id: 'command-10', text: 'open YouTube', outcome: 'done', at: 10 }]);
    expect(entriesFromChange({ lastGesture: null, lastCommand: command }, { lastGesture: null, lastCommand: command }, 200)).toEqual([]);
    expect(entriesFromChange(null, { lastGesture: null, lastCommand: { ...command, text: '  ' } }, 100)).toEqual([]);
  });

  it('records a gesture when the last gesture changes', () => {
    const entries = entriesFromChange({ lastGesture: 'point', lastCommand: null }, { lastGesture: 'pinch', lastCommand: null }, 500);
    expect(entries).toEqual([{ kind: 'gesture', id: 'gesture-500-pinch', key: 'pinch', at: 500 }]);
    expect(entriesFromChange({ lastGesture: 'pinch', lastCommand: null }, { lastGesture: 'pinch', lastCommand: null }, 600)).toEqual([]);
  });

  it('says how long ago in coarse steps', () => {
    const now = 10 * 24 * 3600 * 1000;
    expect(recency(now - 20 * 1000, now)).toEqual({ unit: 'now' });
    expect(recency(now - 5 * 60 * 1000, now)).toEqual({ unit: 'minutes', value: 5 });
    expect(recency(now - 3 * 3600 * 1000, now)).toEqual({ unit: 'hours', value: 3 });
    expect(recency(now - 2 * 24 * 3600 * 1000, now)).toEqual({ unit: 'days', value: 2 });
    expect(recency(now + 1000, now)).toEqual({ unit: 'now' });
  });
});
