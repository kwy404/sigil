import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { LevelRing } from '../control-sphere';
import { useI18n } from '../i18n';
import type { ControlResult } from '../sigil-core';
import {
  changeMediaVolume,
  changeScreenBrightness,
  getNativeControl,
  readLevels,
  UNKNOWN_LEVELS,
  type LevelsSnapshot,
} from '../system-control';
import { Button, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';

/** How often the rings read the levels while Sigil is in front, so hardware keys and the system panel show up live. */
const POLL_MS = 600;
const RING = 72;

type Problem = 'volume' | 'brightness_access' | 'brightness' | null;

function RoundButton({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.round, pressed ? styles.pressed : null]}>
      <Text style={styles.roundText}>{text}</Text>
    </Pressable>
  );
}

/**
 * Quick actions of the Control Sphere: volume and brightness, each with a
 * live level ring and step buttons, plus mute. The same controls the voice
 * planner and the pinch knob and slider use.
 */
export function SphereQuickActions() {
  const { messages: m, format } = useI18n();
  const native = useMemo(() => getNativeControl(), []);
  const [levels, setLevels] = useState<LevelsSnapshot>(UNKNOWN_LEVELS);
  const [problem, setProblem] = useState<Problem>(null);

  const refresh = useCallback(async () => {
    setLevels(await readLevels(native));
  }, [native]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (AppState.currentState !== 'active') return;
      const next = await readLevels(native);
      if (alive) setLevels(next);
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [native]);

  const after = (result: ControlResult, kind: 'volume' | 'brightness') => {
    if (result.ok) {
      setProblem(null);
    } else if (kind === 'brightness' && result.reason === 'needs_permission') {
      setProblem('brightness_access');
    } else {
      setProblem(kind);
    }
    refresh();
  };

  const volume = (action: 'up' | 'down' | 'mute' | 'unmute') => changeMediaVolume(native, action).then((r) => after(r, 'volume'));
  const brightness = (direction: 'up' | 'down') => changeScreenBrightness(native, direction).then((r) => after(r, 'brightness'));

  const percent = (level: number | null) => (level === null ? '' : format.percent(level * 100));

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.control}>
          <LevelRing
            level={levels.muted ? 0 : levels.volume}
            size={RING}
            color={tokens.color.accent}
            label={m.quick.volume}
            valueText={levels.muted ? m.quick.mute : percent(levels.volume)}
          />
          <Text style={styles.caption}>{levels.volume === null ? m.quick.unavailable : m.quick.volume}</Text>
          <View style={styles.buttons}>
            <RoundButton text="-" label={m.quick.volumeDown} onPress={() => volume('down')} />
            <RoundButton
              text={levels.muted ? m.quick.unmute : m.quick.mute}
              label={levels.muted ? m.quick.unmute : m.quick.mute}
              onPress={() => volume(levels.muted ? 'unmute' : 'mute')}
            />
            <RoundButton text="+" label={m.quick.volumeUp} onPress={() => volume('up')} />
          </View>
        </View>
        <View style={styles.control}>
          <LevelRing
            level={levels.brightness}
            size={RING}
            color={tokens.color.warning}
            label={m.quick.brightness}
            valueText={percent(levels.brightness)}
          />
          <Text style={styles.caption}>{levels.brightness === null ? m.quick.unavailable : m.quick.brightness}</Text>
          <View style={styles.buttons}>
            <RoundButton text="-" label={m.quick.brightnessDown} onPress={() => brightness('down')} />
            <RoundButton text="+" label={m.quick.brightnessUp} onPress={() => brightness('up')} />
          </View>
        </View>
      </View>
      {problem === 'volume' ? <Text style={textStyles.muted}>{m.quick.volumeUnsupported}</Text> : null}
      {problem === 'brightness' ? <Text style={textStyles.muted}>{m.quick.brightnessUnsupported}</Text> : null}
      {problem === 'brightness_access' && native ? (
        <View style={styles.access}>
          <Text style={textStyles.muted}>{m.system.access.brightness}</Text>
          <Button label={m.system.buttons.allowBrightness} onPress={() => native.openWriteSettings()} />
          <Button label={m.system.buttons.displaySettings} tone="neutral" onPress={() => native.openPanel('display')} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: tokens.space.md, alignSelf: 'stretch' },
  row: { flexDirection: 'row', justifyContent: 'space-around', gap: tokens.space.md },
  control: { alignItems: 'center', gap: tokens.space.sm, flex: 1 },
  caption: { color: tokens.color.textMuted, fontSize: tokens.font.size.caption, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: tokens.space.sm },
  round: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  roundText: { color: tokens.color.text, fontSize: 13, fontWeight: '600' },
  access: { gap: tokens.space.sm },
});
