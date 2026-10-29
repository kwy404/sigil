import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { albumById, GESTURE_ALBUMS } from '../../catalog/gestures';
import { describeAction, useDescribeContext, useI18n } from '../../i18n';
import { AnimatedGlyph } from '../../ui/animated-glyph';
import { Artwork, Cover } from '../../ui/artwork';
import { GridBackdrop } from '../../ui/backdrop';
import { Button } from '../../ui/button';
import { EmptyState } from '../../ui/empty';
import type { GlyphName } from '../../ui/glyph';
import { HandPreview } from '../../ui/hand-preview';
import { ListGroup, ListRow } from '../../ui/list';
import { Screen, Section } from '../../ui/screen';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { appOverrides, generalBinding, registry, useBackLabel, useOpen } from '../shared';

/** One sign as an album page: the drawing sign, what it does, how to make it, where apps change it. */
export function GestureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { messages: m } = useI18n();
  const ctx = useDescribeContext(registry);
  const open = useOpen();
  const backLabel = useBackLabel();
  const { width } = useWindowDimensions();
  const album = albumById(id ?? '') ?? GESTURE_ALBUMS[0];
  const t = m.ui.gestures;
  const text = t.albums[album.id];
  const art = Math.max(1, Math.min(260, Math.round(width * 0.64)));
  const overrides = appOverrides(album.keys);
  const index = GESTURE_ALBUMS.indexOf(album) + 1;
  const preview = Math.max(1, Math.min(width - GUTTER * 2, 420));

  return (
    <Screen title={text.title} hideLargeTitle back={{ label: backLabel }} collapseAt={art + 40}>
      <View style={styles.hero}>
        <View style={styles.cover}>
          <Artwork glyph={album.icon as GlyphName} size={art} radius={22} ornament={album.ornament} index={index} lit bare />
          <View style={[StyleSheet.absoluteFill, styles.glyph]} pointerEvents="none">
            <AnimatedGlyph name={album.icon as GlyphName} size={art * 0.46} />
          </View>
        </View>
        <Txt variant="title1" align="center" accessibilityRole="header" style={styles.title}>
          {text.title}
        </Txt>
        <Txt variant="headline" tone="accent" align="center">
          {text.does}
        </Txt>
        <Txt variant="monoTag" tone="tertiary" align="center" style={styles.meta}>
          {`${t.groups[album.group]} · ${t.detail.directions(album.keys.length)}`}
        </Txt>
        <View style={styles.actions}>
          <Button label={m.ui.common.practice} icon="play" size="lg" onPress={() => open.practice(album.id)} style={styles.action} />
          <Button
            label={m.ui.common.live}
            icon="arrow-up-right"
            variant="secondary"
            size="lg"
            onPress={open.live}
            style={styles.action}
          />
        </View>
      </View>

      <Section title={t.detail.howTitle}>
        <Txt variant="body" tone="secondary" style={styles.paragraph}>
          {text.how}
        </Txt>
      </Section>

      <Section title={t.detail.seenTitle} caption={t.detail.seenCaption}>
        <View style={[styles.preview, continuous, { height: preview * 0.72 }]}>
          <GridBackdrop cell={20} opacity={0.08} fadeTo={color.surface} />
          <HandPreview clip={album.id} width={preview} height={preview * 0.72} />
        </View>
      </Section>

      <Section title={t.detail.everywhereTitle} caption={t.detail.everywhereCaption}>
        <ListGroup>
          {album.keys.map((key) => {
            const binding = generalBinding(key);
            return (
              <ListRow
                key={key}
                title={m.gestures[key]}
                value={binding ? describeAction(binding.action, ctx) : m.actions.none}
                valueTone="primary"
              />
            );
          })}
        </ListGroup>
      </Section>

      <Section title={t.detail.appsTitle}>
        {overrides.length > 0 ? (
          <ListGroup inset={66}>
            {overrides.map(({ profileId, binding }) => (
              <ListRow
                key={`${profileId}-${binding.key}`}
                title={ctx.appName(profileId)}
                subtitle={`${m.gestures[binding.key]}: ${describeAction(binding.action, ctx)}`}
                leading={<Cover name={ctx.appName(profileId)} overline="" size={40} radius={10} />}
                chevron
                onPress={() => open.app(profileId)}
              />
            ))}
          </ListGroup>
        ) : (
          <EmptyState icon="app-profile" title={m.ui.apps.noChanges} body={t.detail.appsEmpty} />
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: 8 },
  cover: { boxShadow: '0px 24px 48px rgba(0, 0, 0, 0.5)', borderRadius: 22 },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 22 },
  meta: { marginTop: 8 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20, alignSelf: 'stretch' },
  action: { flex: 1, alignSelf: 'auto' },
  paragraph: { paddingHorizontal: GUTTER },
  preview: {
    marginHorizontal: GUTTER,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
