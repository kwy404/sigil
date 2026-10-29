import { router, type Href } from 'expo-router';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useI18n } from '../../i18n';
import { useSigilSession } from '../../session';
import { IconButton } from '../../ui/button';
import { StatusDot } from '../../ui/chip';
import { Glass } from '../../ui/glass';
import { PressableScale } from '../../ui/press';
import { SigilMark, type MarkState } from '../../ui/sigil-mark';
import { chrome, color, radius } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { sessionStatus } from '../status';
import { LevelBars } from './level-bars';

export function markStateOf(phase: string, listening: boolean): MarkState {
  if (listening) return 'listening';
  switch (phase) {
    case 'tracking':
      return 'active';
    case 'starting':
      return 'thinking';
    case 'paused':
      return 'idle';
    default:
      return 'off';
  }
}

/**
 * The floating command pill above the tab bar: the session at a glance on
 * the left (opens Live), a field to say or type a command (opens the command
 * sheet), the mic and the start or pause control.
 */
export function CommandPill({ style }: { style?: StyleProp<ViewStyle> }) {
  const session = useSigilSession();
  const { messages: m } = useI18n();
  const status = sessionStatus(session, m);
  const t = m.ui.pill;
  const running = session.phase === 'tracking' || session.phase === 'starting';

  const transport = () => {
    if (session.phase === 'tracking') session.pause();
    else if (session.phase === 'paused') session.resume();
    else if (session.phase !== 'starting') void session.start();
  };
  const talk = () => (session.listening ? session.stopListening() : session.listen());

  return (
    <View style={[styles.shadow, style]}>
      <Glass style={styles.pill} intensity={80} tint={0.84} solid={0.97}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${t.openLive}. ${status.line}`}
          onPress={() => router.push('/live' as Href)}
          scaleTo={0.9}
          style={styles.orb}>
          <SigilMark size={46} state={markStateOf(session.phase, session.listening)} level={session.micLevel} motes={false} />
        </PressableScale>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={t.placeholder}
          accessibilityHint={t.openCommand}
          onPress={() => router.push('/command' as Href)}
          scaleTo={0.98}
          style={styles.field}>
          <View style={styles.statusRow}>
            <StatusDot tone={status.tone} live={status.live} size={6} />
            <Txt variant="monoTag" tone="secondary" numberOfLines={1} style={styles.statusText}>
              {session.phase === 'tracking' && !session.listening ? `${status.label} · ${m.ui.hand[session.hand]}` : status.label}
            </Txt>
          </View>
          {session.listening ? (
            <LevelBars level={session.micLevel} />
          ) : (
            <Txt variant="callout" tone="tertiary" numberOfLines={1}>
              {t.placeholder}
            </Txt>
          )}
        </PressableScale>
        <IconButton
          icon="mic"
          label={session.listening ? t.stopTalking : t.talk}
          onPress={talk}
          active={session.listening}
          size={40}
          variant="plain"
        />
        <IconButton
          icon={running ? 'pause' : 'play'}
          label={session.phase === 'tracking' ? t.pause : session.phase === 'paused' ? t.resume : t.start}
          onPress={transport}
          disabled={session.phase === 'starting'}
          size={40}
          iconSize={17}
          variant={running ? 'secondary' : 'primary'}
        />
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius.pill,
    boxShadow: '0px 12px 32px rgba(0, 0, 0, 0.55)',
  },
  pill: {
    height: chrome.pill,
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 6,
    paddingRight: 9,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  orb: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.canvasDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    overflow: 'hidden',
  },
  field: { flex: 1, justifyContent: 'center', gap: 2, paddingHorizontal: 8, minHeight: 48 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusText: { flexShrink: 1 },
});
