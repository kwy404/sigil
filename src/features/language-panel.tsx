import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_LANGUAGES, MESSAGES, useI18n, type LanguageChoice } from '../i18n';
import { Card } from '../ui/primitives';
import { tokens } from '../ui/tokens';

/** Lets the user follow the phone's language or pick one of the eight. Each option is written in its own language. */
export function LanguagePanel() {
  const { messages: m, choice, deviceLanguage, setChoice } = useI18n();
  const options: { choice: LanguageChoice; label: string; lang: string }[] = [
    { choice: 'system', label: m.language.system(MESSAGES[deviceLanguage].language.name), lang: deviceLanguage },
    ...APP_LANGUAGES.map((language) => ({ choice: language, label: MESSAGES[language].language.name, lang: language })),
  ];

  return (
    <Card title={m.language.title} caption={m.language.caption}>
      <View style={styles.options} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.choice === choice;
          return (
            <Pressable
              key={option.choice}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLanguage={option.lang}
              onPress={() => setChoice(option.choice)}
              style={({ pressed }) => [styles.option, selected ? styles.selected : null, pressed ? styles.pressed : null]}>
              <Text style={[styles.label, selected ? styles.labelSelected : null]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm },
  option: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
  },
  selected: { borderColor: tokens.color.accent, backgroundColor: tokens.color.accentSoft },
  pressed: { opacity: 0.7 },
  label: { color: tokens.color.text, fontSize: 14 },
  labelSelected: { color: tokens.color.accent, fontWeight: '600' },
});
