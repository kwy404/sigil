import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import type { ChecklistItem } from '../../session/types';
import { Button } from '../../ui/button';
import { Tag } from '../../ui/chip';
import { Glyph } from '../../ui/glyph';
import { haptic } from '../../ui/haptics';
import { alpha, color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { CHECKLIST_GLYPH, OPTIONAL_ITEMS } from '../status';

const CARD_WIDTH = 268;

/**
 * One card per missing permission, in the order Sigil needs them, each with
 * the one Fix that opens the right Android screen. A card leaves as soon as
 * the session reports the permission.
 */
export function SetupShelf({ missing, fix }: { missing: readonly ChecklistItem[]; fix: (item: ChecklistItem) => void }) {
  const { messages: m } = useI18n();
  const [pending, setPending] = useState<ChecklistItem | null>(null);

  useEffect(() => {
    if (pending && !missing.includes(pending)) {
      haptic.success();
      setPending(null);
    }
  }, [missing, pending]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(null), 6000);
    return () => clearTimeout(timer);
  }, [pending]);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      snapToInterval={CARD_WIDTH + 12}
      contentContainerStyle={styles.row}>
      {missing.map((item, index) => {
        const text = m.ui.checklist[item];
        const optional = OPTIONAL_ITEMS.includes(item);
        return (
          <View key={item} style={[styles.card, continuous]}>
            <View style={styles.head}>
              <View style={[styles.icon, { backgroundColor: alpha(optional ? color.neutral : color.warning, 0.12) }]}>
                <Glyph name={CHECKLIST_GLYPH[item]} size={20} color={optional ? color.text2 : color.warning} />
              </View>
              <Txt variant="monoTag" tone="tertiary">
                {optional ? m.ui.common.optional : `${String(index + 1).padStart(2, '0')}/${String(missing.length).padStart(2, '0')}`}
              </Txt>
            </View>
            <Txt variant="headline" numberOfLines={2}>
              {text.title}
            </Txt>
            <Txt variant="footnote" tone="secondary" style={styles.body}>
              {text.body}
            </Txt>
            <View style={styles.footer}>
              <Button
                label={m.ui.common.fix}
                size="sm"
                variant={optional ? 'secondary' : 'primary'}
                trailingIcon="chevron-right"
                loading={pending === item}
                onPress={() => {
                  setPending(item);
                  fix(item);
                }}
              />
              {item === 'restrictedSettings' ? <Tag label="Android 13+" /> : null}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: GUTTER, gap: 12, alignItems: 'stretch' },
  card: {
    width: CARD_WIDTH,
    padding: 16,
    gap: 6,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  icon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  body: { flexGrow: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
});
