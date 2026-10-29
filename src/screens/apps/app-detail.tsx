import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { GENERAL_PROFILE_ID, type ResolvedBinding } from '../../app-profiles';
import { albumForKey } from '../../catalog/gestures';
import { describeAction, useDescribeContext, useI18n } from '../../i18n';
import { Cover } from '../../ui/artwork';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty';
import { Glyph, type GlyphName } from '../../ui/glyph';
import { ListGroup, ListRow } from '../../ui/list';
import { Screen, Section } from '../../ui/screen';
import { color, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { registry, useBackLabel, useOpen } from '../shared';

function Track({
  index,
  binding,
  onPress,
}: {
  index: number;
  binding: ResolvedBinding;
  onPress: () => void;
}) {
  const { messages: m } = useI18n();
  const ctx = useDescribeContext(registry);
  const album = albumForKey(binding.key);
  return (
    <ListRow
      title={m.gestures[binding.key]}
      subtitle={describeAction(binding.action, ctx)}
      leading={
        <View style={styles.trackLead}>
          <Txt variant="mono" tone="tertiary" style={styles.trackNumber}>
            {String(index).padStart(2, '0')}
          </Txt>
          <Glyph name={(album?.icon as GlyphName | undefined) ?? 'cursor'} size={22} color={binding.inherited ? color.text2 : color.accent} />
        </View>
      }
      chevron={album !== undefined}
      onPress={album ? onPress : undefined}
    />
  );
}

/** An app profile as a playlist: its cover, what it is for, and its gesture bindings as tracks. */
export function AppDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messages: m } = useI18n();
  const ctx = useDescribeContext(registry);
  const open = useOpen();
  const backLabel = useBackLabel();
  const { width } = useWindowDimensions();
  const profile = registry.get(id ?? '') ?? registry.get(GENERAL_PROFILE_ID);
  if (!profile) return null;
  const t = m.ui.apps;
  const bindings = registry.bindings(profile.id);
  const general = profile.id === GENERAL_PROFILE_ID;
  const own = bindings.filter((binding) => !binding.inherited);
  const inherited = bindings.filter((binding) => binding.inherited);
  const name = ctx.appName(profile.id);
  const art = Math.min(240, Math.round(width * 0.6));
  const firstAlbum = albumForKey((own[0] ?? bindings[0])?.key ?? 'pinch');

  return (
    <Screen title={name} hideLargeTitle back={{ label: backLabel }} collapseAt={art + 30}>
      <View style={styles.hero}>
        <View style={styles.cover}>
          <Cover name={name} overline={t.overline} size={art} radius={22} featured={general} />
        </View>
        <Txt variant="title1" align="center" accessibilityRole="header" style={styles.title}>
          {name}
        </Txt>
        <Txt variant="callout" tone="secondary" align="center" style={styles.about}>
          {t.about[profile.id] ?? profile.description}
        </Txt>
        <Txt variant="monoTag" tone="tertiary" align="center" style={styles.meta}>
          {general ? t.gestures(bindings.length) : `${t.gestures(bindings.length)} · ${own.length > 0 ? t.changes(own.length) : t.noChanges}`}
        </Txt>
        <View style={styles.actions}>
          <Button
            label={t.detail.practice}
            icon="play"
            size="lg"
            onPress={() => open.practice(firstAlbum?.id ?? 'pinch')}
            style={styles.action}
          />
          <Button label={m.ui.common.live} icon="arrow-up-right" variant="secondary" size="lg" onPress={open.live} style={styles.action} />
        </View>
      </View>

      {general ? (
        <Section title={t.detail.allTitle}>
          <ListGroup inset={86}>
            {bindings.map((binding, index) => (
              <Track key={binding.key} index={index + 1} binding={binding} onPress={() => open.gesture(albumForKey(binding.key)?.id ?? 'pinch')} />
            ))}
          </ListGroup>
        </Section>
      ) : (
        <>
          <Section title={t.detail.changedTitle}>
            {own.length > 0 ? (
              <ListGroup inset={86}>
                {own.map((binding, index) => (
                  <Track key={binding.key} index={index + 1} binding={binding} onPress={() => open.gesture(albumForKey(binding.key)?.id ?? 'pinch')} />
                ))}
              </ListGroup>
            ) : (
              <EmptyState icon="app-profile" title={t.noChanges} body={t.detail.changedEmpty} />
            )}
          </Section>
          <Section title={t.detail.inheritedTitle}>
            <ListGroup inset={86}>
              {inherited.map((binding, index) => (
                <Track
                  key={binding.key}
                  index={own.length + index + 1}
                  binding={binding}
                  onPress={() => open.gesture(albumForKey(binding.key)?.id ?? 'pinch')}
                />
              ))}
            </ListGroup>
          </Section>
        </>
      )}

      <Section title={t.detail.packages}>
        <ListGroup>
          {profile.packages.length > 0 ? (
            profile.packages.map((pkg) => <ListRow key={pkg} title={pkg} icon="code" />)
          ) : (
            <ListRow title={t.detail.everyApp} icon="app-profile" />
          )}
        </ListGroup>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: 8 },
  cover: { boxShadow: '0px 24px 48px rgba(0, 0, 0, 0.5)', borderRadius: 22 },
  title: { marginTop: 22 },
  about: { marginTop: 6, maxWidth: 340 },
  meta: { marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20, alignSelf: 'stretch' },
  action: { flex: 1, alignSelf: 'auto' },
  trackLead: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 60 },
  trackNumber: { width: 22 },
});
