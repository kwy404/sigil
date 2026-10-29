import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { albumById, GESTURE_ALBUMS } from '../../catalog/gestures';
import { isGestureKey } from '../../gesture-engine/gestures';
import { useI18n } from '../../i18n';
import { useSigilSession } from '../../session';
import { GridBackdrop } from '../../ui/backdrop';
import { Button } from '../../ui/button';
import { StatusDot } from '../../ui/chip';
import { Glyph } from '../../ui/glyph';
import { HandPreview } from '../../ui/hand-preview';
import { haptic } from '../../ui/haptics';
import { Screen } from '../../ui/screen';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { useBackLabel } from '../shared';

/**
 * Practice one sign: the hand shows how, Sigil watches, and the page lights
 * up when the session reports the sign.
 */
export function PracticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messages: m } = useI18n();
  const session = useSigilSession();
  const backLabel = useBackLabel();
  const { width } = useWindowDimensions();
  const album = albumById(id ?? '') ?? GESTURE_ALBUMS[0];
  const text = m.ui.gestures.albums[album.id];
  const t = m.ui.practice;
  const baseline = useRef(session.lastGesture);
  const [seen, setSeen] = useState(false);
  const stage = Math.max(1, Math.min(width - GUTTER * 2, 420));

  useEffect(() => {
    const key = session.lastGesture;
    if (key && key !== baseline.current && (album.keys as readonly string[]).includes(key)) {
      setSeen(true);
      haptic.success();
    }
    baseline.current = key;
  }, [session.lastGesture, album.keys]);

  const watching = session.phase === 'tracking';
  const last = session.lastGesture && isGestureKey(session.lastGesture) ? m.gestures[session.lastGesture] : null;

  return (
    <Screen title={t.title} back={{ label: backLabel }}>
      <Txt variant="title3" tone="accent" style={styles.subtitle}>
        {text.title}
      </Txt>
      <View style={[styles.stage, continuous, { height: stage * 0.8 }]}>
        <GridBackdrop cell={20} opacity={0.08} fadeTo={color.surface} />
        <HandPreview clip={album.id} width={stage} height={stage * 0.8} still={seen} />
        {seen ? (
          <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.badge}>
            <Glyph name="check" size={30} color={color.accentInk} />
          </Animated.View>
        ) : null}
      </View>
      <Txt variant="body" tone="secondary" style={styles.how}>
        {text.how}
      </Txt>
      <View style={[styles.status, continuous]} accessibilityLiveRegion="polite">
        {seen ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.statusRow}>
            <StatusDot tone="success" />
            <Txt variant="headline" tone="success" style={styles.flex}>
              {t.success}
            </Txt>
            <Button label={t.again} size="sm" variant="secondary" icon="refresh" onPress={() => setSeen(false)} />
          </Animated.View>
        ) : watching ? (
          <View style={styles.statusRow}>
            <StatusDot tone="accent" live />
            <Txt variant="subhead" tone="secondary" style={styles.flex}>
              {t.waiting}
            </Txt>
          </View>
        ) : (
          <View style={styles.statusRow}>
            <StatusDot tone="neutral" />
            <Txt variant="subhead" tone="secondary" style={styles.flex}>
              {t.startHint}
            </Txt>
            <Button
              label={t.start}
              size="sm"
              icon="play"
              loading={session.phase === 'starting'}
              onPress={() => void session.start()}
            />
          </View>
        )}
      </View>
      {last ? (
        <Txt variant="monoTag" tone="tertiary" style={styles.last}>
          {t.lastSeen(last)}
        </Txt>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  subtitle: { paddingHorizontal: GUTTER, marginTop: -2, marginBottom: 18 },
  stage: {
    marginHorizontal: GUTTER,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  how: { paddingHorizontal: GUTTER, marginTop: 20 },
  status: {
    marginHorizontal: GUTTER,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 60,
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  last: { paddingHorizontal: GUTTER, marginTop: 12 },
});
