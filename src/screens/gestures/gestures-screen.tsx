import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { ALBUM_GROUPS, GESTURE_ALBUMS, type AlbumGroup } from '../../catalog/gestures';
import { useI18n } from '../../i18n';
import { Tag } from '../../ui/chip';
import { Screen } from '../../ui/screen';
import { Segmented } from '../../ui/segmented';
import { GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { useOpen } from '../shared';
import { AlbumCard } from './album-card';

type Filter = 'all' | AlbumGroup;

const GAP = 14;

/** Every sign as an album in a two column grid, with a filter by kind. */
export function GesturesScreen() {
  const { messages: m } = useI18n();
  const { width } = useWindowDimensions();
  const open = useOpen();
  const [filter, setFilter] = useState<Filter>('all');
  const t = m.ui.gestures;
  const albums = GESTURE_ALBUMS.filter((album) => filter === 'all' || album.group === filter);
  const card = Math.floor((Math.min(width, 520) - GUTTER * 2 - GAP) / 2);

  return (
    <Screen title={t.title} accessory={<Tag label={String(GESTURE_ALBUMS.length).padStart(2, '0')} icon="grid" />}>
      <Txt variant="callout" tone="secondary" style={styles.intro}>
        {t.intro(GESTURE_ALBUMS.length)}
      </Txt>
      <View style={styles.filters}>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: t.filters.all }, ...ALBUM_GROUPS.map((group) => ({ value: group, label: t.filters[group] }))]}
        />
      </View>
      <View style={styles.grid}>
        {albums.map((album) => (
          <Animated.View key={album.id} entering={FadeIn.duration(200)} layout={LinearTransition.duration(220)}>
            <AlbumCard album={album} width={card} onPress={() => open.gesture(album.id)} />
          </Animated.View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: GUTTER, marginTop: 4 },
  filters: { marginTop: 20, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER, columnGap: GAP, rowGap: 22 },
});
