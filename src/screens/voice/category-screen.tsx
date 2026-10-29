import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Glyph } from '../../ui/glyph';
import { Screen } from '../../ui/screen';
import { color, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { useBackLabel, useOpen } from '../shared';
import { CATEGORY_GLYPH, CommandCard, VOICE_CATEGORIES, type VoiceCategory } from './command-card';

/** Every command of one category, full width; each opens its dry run plan. */
export function VoiceCategoryScreen() {
  const { category } = useLocalSearchParams<{ category: string }>();
  const { messages: m } = useI18n();
  const open = useOpen();
  const backLabel = useBackLabel();
  const current: VoiceCategory = (VOICE_CATEGORIES as readonly string[]).includes(category ?? '') ? (category as VoiceCategory) : 'apps';
  const t = m.ui.voice;
  const examples = t.examples[current];

  return (
    <Screen title={t.categories[current]} back={{ label: backLabel }}>
      <View style={styles.head}>
        <Glyph name={CATEGORY_GLYPH[current]} size={18} color={color.accent} />
        <Txt variant="callout" tone="secondary" style={styles.flex}>
          {t.categoryCaptions[current]}
        </Txt>
        <Txt variant="monoTag" tone="tertiary">
          {t.commands(examples.length)}
        </Txt>
      </View>
      <View style={styles.list}>
        {examples.map((text) => (
          <CommandCard key={text} text={text} category={current} plain onPress={() => open.command(text)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: GUTTER, marginTop: 4 },
  list: { paddingHorizontal: GUTTER, gap: 12, marginTop: 20 },
});
