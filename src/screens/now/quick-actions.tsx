import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import type { SessionActions, SessionState } from '../../session/types';
import { IconButton } from '../../ui/button';
import { haptic } from '../../ui/haptics';
import { Scrubber } from '../../ui/scrubber';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { sendMediaKey, type MediaKey } from './media-keys';

/** Volume and brightness as scrubbers, and the media keys of the player in front, in one quiet panel. */
export function QuickActions({ session }: { session: SessionState & SessionActions }) {
  const { messages: m } = useI18n();
  const t = m.ui.now;
  const [mediaFailed, setMediaFailed] = useState(false);
  const [busy, setBusy] = useState<MediaKey | null>(null);

  const media = async (key: MediaKey) => {
    setBusy(key);
    const ok = await sendMediaKey(key);
    setBusy(null);
    setMediaFailed(!ok);
    if (!ok) haptic.warning();
  };

  return (
    <View style={[styles.card, continuous]}>
      <Scrubber
        label={t.volume}
        value={session.levels.volume}
        onCommit={(percent) => void session.setVolume(percent)}
        iconLow="speaker-low"
        iconHigh="speaker-high"
        unavailable={m.ui.common.unavailable}
      />
      <View style={styles.separator} />
      <Scrubber
        label={t.brightness}
        value={session.levels.brightness}
        onCommit={(percent) => void session.setBrightness(percent)}
        iconLow="sun-low"
        iconHigh="sun-high"
        unavailable={m.ui.common.unavailable}
      />
      <View style={styles.separator} />
      <View style={styles.mediaRow}>
        <Txt variant="caption" tone="secondary" style={styles.mediaLabel}>
          {t.media.title}
        </Txt>
        <View style={styles.mediaKeys}>
          <IconButton icon="previous" label={t.media.previous} onPress={() => void media('previous')} disabled={busy !== null} size={44} />
          <IconButton
            icon="play"
            label={t.media.playPause}
            onPress={() => void media('play_pause')}
            disabled={busy !== null}
            size={52}
            iconSize={20}
            variant="tinted"
          />
          <IconButton icon="next" label={t.media.next} onPress={() => void media('next')} disabled={busy !== null} size={44} />
        </View>
      </View>
      {mediaFailed ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)}>
          <Txt variant="footnote" tone="warning" style={styles.hint}>
            {t.media.failed}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline },
  mediaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 30 },
  mediaLabel: { flexShrink: 1 },
  mediaKeys: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  hint: { paddingLeft: 30 },
});
