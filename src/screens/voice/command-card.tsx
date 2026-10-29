import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Glyph, type GlyphName } from '../../ui/glyph';
import { PressableScale } from '../../ui/press';
import { color, continuous } from '../../ui/theme';
import { Txt } from '../../ui/type';

export type VoiceCategory = 'apps' | 'media' | 'system' | 'messages';

export const VOICE_CATEGORIES: readonly VoiceCategory[] = ['apps', 'media', 'system', 'messages'];

export const CATEGORY_GLYPH: Record<VoiceCategory, GlyphName> = {
  apps: 'app-profile',
  media: 'play',
  system: 'sliders',
  messages: 'action-chain',
};

/** A spoken command as a card: what to say, in quotes, and where it belongs. */
export function CommandCard({
  text,
  category,
  width,
  plain = false,
  onPress,
}: {
  text: string;
  category: VoiceCategory;
  /** Fixed width on a shelf; without it the card fills its row. */
  width?: number;
  /** Hide the category where the page already groups by it. */
  plain?: boolean;
  onPress: () => void;
}) {
  const { messages: m } = useI18n();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityHint={m.ui.voice.preview}
      onPress={onPress}
      scaleTo={0.97}
      style={[styles.card, continuous, width === undefined ? null : { width }]}>
      <View style={styles.head}>
        <View style={styles.badge}>
          <Glyph name={plain ? 'voice' : CATEGORY_GLYPH[category]} size={14} color={color.accent} />
          <Txt variant="monoTag" tone="tertiary" numberOfLines={1}>
            {plain ? m.ui.voice.preview : m.ui.voice.categories[category]}
          </Txt>
        </View>
        <Glyph name="arrow-up-right" size={16} color={color.text3} />
      </View>
      <Txt variant="subhead" numberOfLines={3} style={styles.text}>
        {m.quote(text)}
      </Txt>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 112,
    padding: 14,
    gap: 10,
    borderRadius: 18,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  text: { lineHeight: 21 },
});
