import { StyleSheet, View } from 'react-native';

import { GESTURE_ALBUMS, type GestureAlbum } from '../../catalog/gestures';
import { useI18n } from '../../i18n';
import { Artwork } from '../../ui/artwork';
import type { GlyphName } from '../../ui/glyph';
import { PressableScale } from '../../ui/press';
import { Txt } from '../../ui/type';

/** A gesture as an album: square art, its name and what it does. */
export function AlbumCard({ album, width, onPress }: { album: GestureAlbum; width: number; onPress: () => void }) {
  const { messages: m } = useI18n();
  const text = m.ui.gestures.albums[album.id];
  const index = GESTURE_ALBUMS.indexOf(album) + 1;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${text.title}. ${text.does}`}
      onPress={onPress}
      scaleTo={0.96}
      style={{ width }}>
      <Artwork glyph={album.icon as GlyphName} size={width} index={index} ornament={album.ornament} />
      <View style={styles.texts}>
        <Txt variant="subhead" numberOfLines={1}>
          {text.title}
        </Txt>
        <Txt variant="footnote" tone="tertiary" numberOfLines={2}>
          {text.does}
        </Txt>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  texts: { marginTop: 10, gap: 1, paddingRight: 4 },
});
