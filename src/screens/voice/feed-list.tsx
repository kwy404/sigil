import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { albumForKey } from '../../catalog/gestures';
import { isGestureKey } from '../../gesture-engine/gestures';
import { recency, type CommandOutcome, type FeedEntry } from '../../history/feed';
import { describeAction, useDescribeContext, useI18n, type Messages } from '../../i18n';
import { Glyph, type GlyphName } from '../../ui/glyph';
import { alpha, color, continuous, GUTTER, statusColor, type StatusTone } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { generalBinding, registry } from '../shared';

const OUTCOME_TONE: Record<CommandOutcome, StatusTone> = {
  done: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  not_understood: 'warning',
};

/** The current time, refreshed every half minute, for relative times. */
export function useNow(intervalMs = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function relativeTime(at: number, now: number, m: Messages): string {
  const r = recency(at, now);
  switch (r.unit) {
    case 'now':
      return m.ui.common.justNow;
    case 'minutes':
      return m.ui.common.minutesAgo(r.value);
    case 'hours':
      return m.ui.common.hoursAgo(r.value);
    case 'days':
      return m.ui.common.daysAgo(r.value);
  }
}

/**
 * A calm feed of what Sigil did: one line per gesture or request on a thin
 * timeline, the outcome as a colored dot with its word, the time in mono.
 */
export function FeedList({ entries }: { entries: readonly FeedEntry[] }) {
  const { messages: m } = useI18n();
  const ctx = useDescribeContext(registry);
  const now = useNow();

  return (
    <View style={[styles.card, continuous]}>
      {entries.map((entry, index) => {
        let icon: GlyphName = 'voice';
        let title: string;
        let detail: string;
        let tone: StatusTone = 'accent';
        if (entry.kind === 'gesture') {
          icon = (albumForKey(entry.key)?.icon as GlyphName | undefined) ?? 'cursor';
          title = isGestureKey(entry.key) ? m.gestures[entry.key] : entry.key;
          const binding = generalBinding(entry.key);
          detail = binding ? describeAction(binding.action, ctx) : '';
        } else {
          title = m.quote(entry.text);
          detail = m.ui.voice.outcomes[entry.outcome];
          tone = OUTCOME_TONE[entry.outcome];
        }
        const last = index === entries.length - 1;
        return (
          <Animated.View key={entry.id} entering={FadeInDown.duration(260)} style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.node, entry.kind === 'command' ? { borderColor: alpha(statusColor(tone), 0.5) } : null]}>
                <Glyph name={icon} size={17} color={entry.kind === 'gesture' ? color.accent : color.text} />
              </View>
              {last ? null : <View style={styles.line} />}
            </View>
            <View style={[styles.body, last ? null : styles.bodyGap]}>
              <View style={styles.titleRow}>
                <Txt variant="subhead" numberOfLines={2} style={styles.title}>
                  {title}
                </Txt>
                <Txt variant="mono" tone="tertiary" style={styles.time}>
                  {relativeTime(entry.at, now, m)}
                </Txt>
              </View>
              {detail ? (
                <View style={styles.detailRow}>
                  {entry.kind === 'command' ? <View style={[styles.dot, { backgroundColor: statusColor(tone) }]} /> : null}
                  <Txt variant="footnote" tone="tertiary" numberOfLines={2} style={styles.detail}>
                    {detail}
                  </Txt>
                </View>
              ) : null}
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  row: { flexDirection: 'row', gap: 12 },
  rail: { alignItems: 'center', width: 34 },
  node: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  line: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: color.hairlineStrong, marginVertical: 4 },
  body: { flex: 1, gap: 3, paddingTop: 6 },
  bodyGap: { paddingBottom: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1 },
  time: { fontSize: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  detail: { flex: 1 },
});
