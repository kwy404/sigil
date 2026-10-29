import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useI18n } from '../../i18n';
import { useSigilSession } from '../../session';
import type { ChecklistItem } from '../../session/types';
import { Button } from '../../ui/button';
import { ListGroup, ListRow } from '../../ui/list';
import { Screen } from '../../ui/screen';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { useBackLabel } from '../shared';
import { CHECKLIST_GLYPH, OPTIONAL_ITEMS } from '../status';

const NEEDED: readonly ChecklistItem[] = ['camera', 'microphone', 'restrictedSettings', 'accessibility', 'overlay'];

/** Every permission with its state and the one tap that opens the right Android screen. */
export function PermissionsScreen() {
  const { messages: m } = useI18n();
  const session = useSigilSession();
  const backLabel = useBackLabel();
  const [helpOpen, setHelpOpen] = useState(false);
  const t = m.ui.settings.permissionsPage;

  const row = (item: ChecklistItem) => {
    const granted = session.checklist[item];
    const text = m.ui.checklist[item];
    return (
      <ListRow
        key={item}
        title={text.title}
        subtitle={text.body}
        icon={CHECKLIST_GLYPH[item]}
        iconTone={granted ? 'success' : OPTIONAL_ITEMS.includes(item) ? 'neutral' : 'warning'}
        value={granted ? m.ui.common.allowed : m.ui.common.fix}
        valueTone={granted ? 'success' : 'accent'}
        chevron={!granted}
        onPress={granted ? undefined : () => session.fix(item)}
      />
    );
  };

  return (
    <Screen title={m.ui.settings.permissions} back={{ label: backLabel }}>
      <Txt variant="callout" tone="secondary" style={styles.caption}>
        {t.caption}
      </Txt>
      <ListGroup header={t.required} style={styles.group}>
        {NEEDED.map(row)}
      </ListGroup>

      {!session.checklist.accessibility ? (
        <View style={[styles.help, continuous]}>
          <Button
            label={t.restrictedHelp}
            variant="ghost"
            size="sm"
            trailingIcon={helpOpen ? 'chevron-up' : 'chevron-down'}
            onPress={() => setHelpOpen((open) => !open)}
            style={styles.helpToggle}
          />
          {helpOpen ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.helpBody}>
              {t.restrictedSteps.map((line, index) => (
                <View key={line} style={styles.step}>
                  <Txt variant="mono" tone="accent">
                    {index + 1}
                  </Txt>
                  <Txt variant="callout" tone="secondary" style={styles.flex}>
                    {line}
                  </Txt>
                </View>
              ))}
              <Button label={t.openAppInfo} variant="secondary" size="sm" onPress={() => session.fix('restrictedSettings')} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}

      <ListGroup header={t.optionalHeader} footer={t.writeSettingsNote} style={styles.group}>
        {row('notifications')}
        <ListRow
          title={m.ui.checklist.writeSettings.title}
          subtitle={m.ui.checklist.writeSettings.body}
          icon="sun-high"
          value={m.ui.common.openSettings}
          valueTone="accent"
          external
          onPress={() => {
            if (Platform.OS === 'android') {
              void Linking.sendIntent('android.settings.action.MANAGE_WRITE_SETTINGS').catch(() => Linking.openSettings());
            }
          }}
        />
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  caption: { paddingHorizontal: GUTTER, marginTop: 4 },
  group: { marginTop: 24 },
  help: {
    marginHorizontal: GUTTER,
    marginTop: 12,
    padding: 6,
    borderRadius: 16,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  helpToggle: { alignSelf: 'stretch', justifyContent: 'space-between' },
  helpBody: { gap: 10, padding: 10, paddingTop: 2 },
  step: { flexDirection: 'row', gap: 10 },
});
