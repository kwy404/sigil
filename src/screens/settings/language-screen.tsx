import { StyleSheet, View } from 'react-native';

import { APP_LANGUAGES, MESSAGES, useI18n, type LanguageChoice } from '../../i18n';
import { Glyph } from '../../ui/glyph';
import { ListGroup, ListRow } from '../../ui/list';
import { Screen } from '../../ui/screen';
import { color, GUTTER } from '../../ui/theme';
import { Txt } from '../../ui/type';
import { useBackLabel } from '../shared';

/** The phone's language or one of the eight, each written in its own language. */
export function LanguageScreen() {
  const { messages: m, choice, deviceLanguage, setChoice } = useI18n();
  const backLabel = useBackLabel();
  const t = m.ui.settings;
  const options: { choice: LanguageChoice; label: string; detail?: string; lang: string }[] = [
    { choice: 'system', label: t.languagePage.phone, detail: MESSAGES[deviceLanguage].language.name, lang: deviceLanguage },
    ...APP_LANGUAGES.map((language) => ({ choice: language, label: MESSAGES[language].language.name, lang: language })),
  ];

  return (
    <Screen title={t.language} back={{ label: backLabel }}>
      <Txt variant="callout" tone="secondary" style={styles.caption}>
        {t.languagePage.caption}
      </Txt>
      <View accessibilityRole="radiogroup" style={styles.group}>
        <ListGroup>
          {options.map((option) => {
            const selected = option.choice === choice;
            return (
              <ListRow
                key={option.choice}
                title={option.label}
                subtitle={option.detail}
                trailing={selected ? <Glyph name="check" size={20} color={color.accent} /> : null}
                onPress={() => setChoice(option.choice)}
                accessibilityHint={option.lang}
              />
            );
          })}
        </ListGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: { paddingHorizontal: GUTTER, marginTop: 4 },
  group: { marginTop: 24 },
});
