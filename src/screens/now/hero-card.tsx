import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { useI18n } from '../../i18n';
import type { SessionActions, SessionState } from '../../session/types';
import { GridBackdrop, Glow } from '../../ui/backdrop';
import { Button, IconButton } from '../../ui/button';
import { StatusChip } from '../../ui/chip';
import { SigilMark } from '../../ui/sigil-mark';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { markStateOf } from '../chrome/command-pill';
import { useOpen } from '../shared';
import { errorText, sessionStatus } from '../status';

/** The Start Sigil hero: the living mark, the state in big type and the one action that matters now. */
export function HeroCard({ session }: { session: SessionState & SessionActions }) {
  const { messages: m } = useI18n();
  const open = useOpen();
  const [width, setWidth] = useState(350);
  const status = sessionStatus(session, m);
  const t = m.ui.now.hero;
  const s = m.ui.session;

  let title = t.offTitle;
  let body = t.offBody;
  switch (session.phase) {
    case 'starting':
      title = t.startingTitle;
      body = t.startingBody;
      break;
    case 'tracking':
      title = t.onTitle;
      body = t.onBody;
      break;
    case 'paused':
      title = t.pausedTitle;
      body = t.pausedBody;
      break;
    case 'error':
      title = t.errorTitle;
      body = errorText(session.error, m);
      break;
  }

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const markSize = Math.min(196, width * 0.56);

  return (
    <View style={[styles.card, continuous]} onLayout={onLayout}>
      <GridBackdrop cell={22} opacity={0.08} fadeTo={color.surface} center={{ x: 0.5, y: 0.3 }} />
      <Glow x={width / 2} y={34 + markSize / 2} radius={markSize * 0.95} opacity={session.phase === 'tracking' ? 0.24 : 0.14} />
      <View style={styles.top}>
        <StatusChip tone={status.tone} label={status.label} live={status.live} />
        {session.phase === 'tracking' ? (
          <Txt variant="monoTag" tone="tertiary">
            {m.ui.hand[session.hand]}
          </Txt>
        ) : null}
      </View>
      <View style={[styles.mark, { height: markSize }]}>
        <SigilMark size={markSize} state={markStateOf(session.phase, session.listening)} level={session.micLevel} />
      </View>
      <View style={styles.texts}>
        <Txt variant="title1" accessibilityRole="header">
          {title}
        </Txt>
        <Txt variant="callout" tone="secondary">
          {body}
        </Txt>
      </View>
      <View style={styles.actions}>
        {session.phase === 'tracking' ? (
          <>
            <Button label={s.pause} icon="pause" variant="secondary" size="lg" onPress={session.pause} />
            <Button label={s.stop} icon="stop" variant="ghost" size="lg" onPress={session.stop} />
          </>
        ) : session.phase === 'paused' ? (
          <>
            <Button label={s.resume} icon="play" size="lg" onPress={session.resume} />
            <Button label={s.stop} icon="stop" variant="ghost" size="lg" onPress={session.stop} />
          </>
        ) : (
          <Button
            label={session.phase === 'starting' ? s.starting : session.phase === 'error' ? m.ui.common.tryAgain : s.start}
            icon="play"
            size="lg"
            loading={session.phase === 'starting'}
            onPress={() => void session.start()}
          />
        )}
        {session.phase === 'tracking' || session.phase === 'paused' ? (
          <IconButton icon="arrow-up-right" label={m.ui.common.live} onPress={open.live} size={52} style={styles.liveRound} />
        ) : (
          <Button label={m.ui.common.live} icon="arrow-up-right" variant="secondary" size="lg" onPress={open.live} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER,
    marginTop: 8,
    borderRadius: 28,
    padding: 20,
    paddingTop: 16,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    overflow: 'hidden',
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  mark: { alignItems: 'center', justifyContent: 'center', marginVertical: 6 },
  texts: { gap: 6, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 20 },
  liveRound: { marginLeft: 'auto' },
});
