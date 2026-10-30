import { router, type Href } from 'expo-router';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HandPreview as CameraPreview } from '../../../modules/sigil-control';
import { albumForKey } from '../../catalog/gestures';
import { useDiagnostics } from '../../diagnostics';
import { isGestureKey } from '../../gesture-engine/gestures';
import { useI18n } from '../../i18n';
import { useSigilSession } from '../../session';
import { GridBackdrop, Glow } from '../../ui/backdrop';
import { Button, IconButton } from '../../ui/button';
import { StatusChip, StatusDot, Tag } from '../../ui/chip';
import { Glyph, type GlyphName } from '../../ui/glyph';
import { HandPreview } from '../../ui/hand-preview';
import { Scrubber } from '../../ui/scrubber';
import { Sheet } from '../../ui/sheet';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { sessionStatus } from '../status';

/**
 * Live, the Now Playing of Sigil: what the camera sees as landmarks, the
 * state in big type, the levels as scrubbers and the big controls.
 */
export function LiveSheet() {
  const { messages: m } = useI18n();
  const session = useSigilSession();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const t = m.ui.live;
  const s = m.ui.session;
  const status = sessionStatus(session, m);
  const tracking = session.phase === 'tracking';
  const album = session.lastGesture ? albumForKey(session.lastGesture) : undefined;
  const lastName = session.lastGesture && isGestureKey(session.lastGesture) ? m.gestures[session.lastGesture] : null;
  const panel = Math.max(1, Math.min(width - GUTTER * 2, 460));
  const seesHand = tracking && session.hand !== 'none';
  // On Android the panel shows what the camera really sees, with the landmarks the tracker found.
  const camera = tracking && CameraPreview !== null;
  const tracker = useDiagnostics()?.tracker ?? null;

  const transport = () => {
    if (session.phase === 'tracking') session.pause();
    else if (session.phase === 'paused') session.resume();
    else if (session.phase !== 'starting') void session.start();
  };

  return (
    <Sheet closeLabel={t.close}>
      {(close) => {
        const goTo = (path: string) => {
          close();
          setTimeout(() => router.navigate(path as Href), 280);
        };
        return (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <View style={styles.headerSide}>
                <IconButton icon="chevron-down" label={t.close} onPress={close} variant="plain" size={40} />
              </View>
              <Txt variant="monoTag" tone="secondary" align="center" style={styles.headerTitle}>
                {t.title}
              </Txt>
              <View style={[styles.headerSide, styles.headerRight]}>
                <Tag label={m.ui.common.onDevice} icon="privacy-shield" />
              </View>
            </View>

            <View style={[styles.preview, continuous, { height: panel * 0.86 }]}>
              <GridBackdrop cell={22} opacity={0.09} fadeTo={color.canvasDeep} center={{ x: 0.5, y: 0.45 }} />
              <Glow x={panel / 2} y={panel * 0.43} radius={panel * 0.5} opacity={tracking ? 0.16 : 0.05} />
              {camera && CameraPreview ? (
                <CameraPreview style={[styles.camera, { width: panel, height: panel * 0.86 }]} />
              ) : (
                <HandPreview
                  clip={seesHand && album ? album.id : 'idle'}
                  width={panel}
                  height={panel * 0.86}
                  live={seesHand}
                  still={!tracking}
                />
              )}
              <View style={styles.overlayTop}>
                <StatusChip tone={tracking ? 'accent' : 'neutral'} label={tracking ? t.cameraOn : t.cameraOff} live={tracking} />
                {tracking ? (
                  <View style={styles.trackerText}>
                    <Txt variant="monoTag" tone="secondary">
                      {m.ui.hand[session.hand]}
                    </Txt>
                    {tracker ? (
                      <Txt variant="monoTag" tone="tertiary">
                        {t.tracker(tracker.cameraFps, tracker.handFps)}
                      </Txt>
                    ) : null}
                  </View>
                ) : null}
              </View>
              {!tracking || session.hand === 'none' ? (
                <View style={styles.overlayCenter} pointerEvents="none">
                  <View style={styles.messagePill}>
                    <Txt variant="subhead" tone="secondary" align="center">
                      {session.phase === 'paused' ? t.paused : tracking ? t.showHand : t.off}
                    </Txt>
                  </View>
                </View>
              ) : null}
              <View style={styles.overlayBottom}>
                <View style={styles.lastGesture}>
                  <Glyph name={(album?.icon as GlyphName | undefined) ?? 'cursor'} size={18} color={lastName ? color.accent : color.text3} />
                  <View>
                    <Txt variant="monoTag" tone="tertiary">
                      {t.lastGesture}
                    </Txt>
                    <Txt variant="subhead" tone={lastName ? 'primary' : 'tertiary'}>
                      {lastName ?? t.noGesture}
                    </Txt>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.titleBlock}>
              <Txt variant="title1">Sigil</Txt>
              <View style={styles.statusLine}>
                <StatusDot tone={status.tone} live={status.live} />
                <Txt variant="headline" tone={status.tone === 'neutral' ? 'secondary' : 'primary'} style={styles.flex}>
                  {status.line}
                </Txt>
              </View>
              {session.lastCommand && session.lastCommand.text ? (
                <View style={styles.lastCommand}>
                  <Txt variant="monoTag" tone="tertiary">
                    {t.lastCommand}
                  </Txt>
                  <Txt variant="callout" tone="secondary" numberOfLines={2}>
                    {`${m.quote(session.lastCommand.text)} · ${m.ui.voice.outcomes[session.lastCommand.outcome]}`}
                  </Txt>
                </View>
              ) : null}
            </View>

            <View style={styles.levels}>
              <Scrubber
                label={m.ui.now.volume}
                value={session.levels.volume}
                onCommit={(percent) => void session.setVolume(percent)}
                iconLow="speaker-low"
                iconHigh="speaker-high"
                unavailable={m.ui.common.unavailable}
              />
              <Scrubber
                label={m.ui.now.brightness}
                value={session.levels.brightness}
                onCommit={(percent) => void session.setBrightness(percent)}
                iconLow="sun-low"
                iconHigh="sun-high"
                unavailable={m.ui.common.unavailable}
              />
            </View>

            <View style={styles.transport}>
              <View style={styles.control}>
                <IconButton icon="stop" label={s.stop} onPress={session.stop} size={60} iconSize={20} disabled={session.phase === 'off'} />
                <Txt variant="caption" tone="tertiary">
                  {s.stop}
                </Txt>
              </View>
              <View style={styles.control}>
                <IconButton
                  icon={tracking || session.phase === 'starting' ? 'pause' : 'play'}
                  label={tracking ? s.pause : session.phase === 'paused' ? s.resume : s.start}
                  onPress={transport}
                  disabled={session.phase === 'starting'}
                  size={84}
                  iconSize={30}
                  variant="primary"
                />
                <Txt variant="caption" tone="secondary">
                  {tracking ? s.pause : session.phase === 'paused' ? s.resume : s.start}
                </Txt>
              </View>
              <View style={styles.control}>
                <IconButton
                  icon="mic"
                  label={session.listening ? m.ui.pill.stopTalking : m.ui.pill.talk}
                  onPress={() => (session.listening ? session.stopListening() : session.listen())}
                  active={session.listening}
                  size={60}
                  iconSize={24}
                />
                <Txt variant="caption" tone="tertiary">
                  {s.talk}
                </Txt>
              </View>
            </View>

            <View style={styles.shortcuts}>
              <Button label={t.gestures} icon="gesture-open-palm" variant="ghost" size="sm" onPress={() => goTo('/gestures')} />
              <Button label={t.apps} icon="app-profile" variant="ghost" size="sm" onPress={() => goTo('/apps')} />
              <Button label={t.settings} icon="settings" variant="ghost" size="sm" onPress={() => goTo('/settings')} />
            </View>
          </ScrollView>
        );
      }}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: GUTTER, gap: 22 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  headerSide: { width: 118, flexDirection: 'row', alignItems: 'center' },
  headerRight: { justifyContent: 'flex-end' },
  headerTitle: { flex: 1 },
  preview: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: color.canvasDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
  },
  overlayTop: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overlayCenter: { position: 'absolute', left: 24, right: 24, top: '44%', alignItems: 'center' },
  camera: { position: 'absolute', left: 0, top: 0 },
  trackerText: { alignItems: 'flex-end', gap: 2 },
  messagePill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(4, 7, 14, 0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  overlayBottom: { position: 'absolute', left: 14, right: 14, bottom: 14, flexDirection: 'row' },
  lastGesture: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(4, 7, 14, 0.82)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  titleBlock: { gap: 6 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lastCommand: { gap: 2, marginTop: 6 },
  levels: { gap: 12 },
  transport: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-evenly' },
  control: { alignItems: 'center', gap: 8, minWidth: 84 },
  shortcuts: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
});
