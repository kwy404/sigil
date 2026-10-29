/// <reference types="expo/types" />
import type { ComponentType } from 'react';
import { StyleSheet, View } from 'react-native';

import { useI18n } from '../../i18n';
import { Glyph } from '../../ui/glyph';
import { color, continuous, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';

/**
 * The on device model section. The model work ships ModelPanel in
 * src/features/model-panel.tsx; when that file is in the build it renders
 * here, and until then this slot shows what is coming.
 */
const panels = require.context('../../features', false, /^\.\/model-panel\.tsx$/);
const ModelPanel: ComponentType | null =
  panels.keys().length > 0 ? ((panels(panels.keys()[0]) as { ModelPanel?: ComponentType }).ModelPanel ?? null) : null;

export function ModelSlot() {
  const { messages: m } = useI18n();
  if (ModelPanel) {
    return (
      <View style={styles.panel}>
        <ModelPanel />
      </View>
    );
  }
  const t = m.ui.settings.modelPage;
  return (
    <View style={[styles.placeholder, continuous]}>
      <View style={styles.icon}>
        <Glyph name="on-device-model" size={26} color={color.accent} />
      </View>
      <Txt variant="headline">{t.placeholderTitle}</Txt>
      <Txt variant="callout" tone="secondary">
        {t.placeholderBody}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { paddingHorizontal: GUTTER },
  placeholder: {
    marginHorizontal: GUTTER,
    gap: 8,
    padding: 18,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: color.hairlineFocus,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.accentSoft,
    marginBottom: 4,
  },
});
