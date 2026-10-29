import { StyleSheet, View } from 'react-native';

import { GENERAL_PROFILE_ID } from '../../app-profiles';
import { useDescribeContext, useI18n } from '../../i18n';
import { Cover } from '../../ui/artwork';
import { Tag } from '../../ui/chip';
import { Glyph } from '../../ui/glyph';
import { ListGroup, ListRow } from '../../ui/list';
import { PressableScale } from '../../ui/press';
import { Screen } from '../../ui/screen';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { registry, useOpen } from '../shared';

/** The app profiles as playlists: General first, then every app with what it changes. */
export function AppsScreen() {
  const { messages: m } = useI18n();
  const ctx = useDescribeContext(registry);
  const open = useOpen();
  const t = m.ui.apps;
  const profiles = registry.list();
  const general = registry.bindings(GENERAL_PROFILE_ID);
  const apps = profiles.filter((profile) => profile.id !== GENERAL_PROFILE_ID);

  return (
    <Screen title={t.title} accessory={<Tag label={String(profiles.length).padStart(2, '0')} icon="app-profile" />}>
      <Txt variant="callout" tone="secondary" style={styles.intro}>
        {t.intro}
      </Txt>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`${ctx.appName(GENERAL_PROFILE_ID)}. ${t.featured}`}
        onPress={() => open.app(GENERAL_PROFILE_ID)}
        scaleTo={0.98}
        style={[styles.featured, continuous]}>
        <Cover name={ctx.appName(GENERAL_PROFILE_ID)} overline={t.overline} size={112} featured />
        <View style={styles.featuredText}>
          <Txt variant="monoTag" tone="accent">
            {t.featured}
          </Txt>
          <Txt variant="title2">{ctx.appName(GENERAL_PROFILE_ID)}</Txt>
          <Txt variant="footnote" tone="secondary">
            {t.about.general}
          </Txt>
          <Txt variant="mono" tone="tertiary">
            {t.gestures(general.length)}
          </Txt>
        </View>
        <Glyph name="chevron-right" size={20} color={color.text3} />
      </PressableScale>

      <ListGroup style={styles.list} inset={70}>
        {apps.map((profile) => {
          const own = registry.bindings(profile.id).filter((binding) => !binding.inherited).length;
          return (
            <ListRow
              key={profile.id}
              title={ctx.appName(profile.id)}
              subtitle={own > 0 ? t.changes(own) : t.noChanges}
              leading={<Cover name={ctx.appName(profile.id)} overline="" size={44} radius={11} />}
              chevron
              onPress={() => open.app(profile.id)}
            />
          );
        })}
      </ListGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: GUTTER, marginTop: 4 },
  featured: {
    marginHorizontal: GUTTER,
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    borderRadius: 24,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  featuredText: { flex: 1, gap: 4 },
  list: { marginTop: 24 },
});
