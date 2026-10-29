import Constants from 'expo-constants';
import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MESSAGES, useI18n } from '../../i18n';
import { usePreferences } from '../../preferences/provider';
import { useSigilSession } from '../../session';
import { GridBackdrop } from '../../ui/backdrop';
import { ListGroup, ListRow, ListSwitchRow } from '../../ui/list';
import { Screen } from '../../ui/screen';
import { SigilMark } from '../../ui/sigil-mark';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { missingItems } from '../status';

export function appVersion(): string {
  return Constants.expoConfig?.version ?? '0.1.0';
}

const go = (path: string) => router.push(`/settings/${path}` as Href);

/** Settings as grouped lists, each row opening a real page. */
export function SettingsScreen() {
  const { messages: m, choice, deviceLanguage } = useI18n();
  const preferences = usePreferences();
  const session = useSigilSession();
  const t = m.ui.settings;
  const missing = missingItems(session.checklist).length;
  const languageName = MESSAGES[choice === 'system' ? deviceLanguage : choice].language.name;

  return (
    <Screen title={t.title}>
      <View style={[styles.profile, continuous]}>
        <GridBackdrop cell={18} opacity={0.07} fadeTo={color.surface} center={{ x: 0.15, y: 0.5 }} />
        <View style={styles.markTile}>
          <SigilMark size={64} state="idle" motes={false} />
        </View>
        <View style={styles.profileText}>
          <Txt variant="title2">Sigil</Txt>
          <Txt variant="footnote" tone="secondary">
            {t.profileLine}
          </Txt>
          <Txt variant="mono" tone="tertiary">
            {t.version(appVersion())}
          </Txt>
        </View>
      </View>

      <ListGroup header={t.general} style={styles.group}>
        <ListRow
          title={t.language}
          subtitle={choice === 'system' ? t.languagePage.phone : undefined}
          icon="globe"
          value={languageName}
          chevron
          onPress={() => go('language')}
        />
        <ListSwitchRow
          title={t.haptics}
          subtitle={t.hapticsCaption}
          icon="haptics"
          value={preferences.haptics}
          onValueChange={preferences.setHaptics}
        />
      </ListGroup>

      <ListGroup header="Sigil" style={styles.group}>
        <ListRow
          title={t.permissions}
          icon="privacy-shield"
          iconTone={missing > 0 ? 'warning' : 'success'}
          value={missing > 0 ? t.permissionsMissing(missing) : t.permissionsAll}
          status={missing > 0 ? 'warning' : 'success'}
          chevron
          onPress={() => go('permissions')}
        />
        <ListRow title={t.model} subtitle={t.modelCaption} icon="on-device-model" chevron onPress={() => go('model')} />
        <ListRow title={t.tutorial} subtitle={t.tutorialCaption} icon="refresh" chevron onPress={() => go('tutorial')} />
      </ListGroup>

      <ListGroup style={styles.group}>
        <ListRow title={t.lab} subtitle={t.labCaption} icon="flask" chevron onPress={() => go('lab')} />
        <ListRow title={t.about} icon="info" value={appVersion()} monoValue chevron onPress={() => go('about')} />
      </ListGroup>

      <Txt variant="footnote" tone="tertiary" align="center" style={styles.footer}>
        {t.footer}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    marginHorizontal: GUTTER,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  markTile: {
    width: 64,
    height: 64,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: color.canvasDeep,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.accentLine,
  },
  profileText: { flex: 1, gap: 2 },
  group: { marginTop: 28 },
  footer: { marginTop: 32, paddingHorizontal: GUTTER },
});
