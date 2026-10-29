import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GENERAL_PROFILE_ID, type ProfileRegistry } from '../app-profiles';
import { describeAction, describeGesture, useDescribeContext } from '../i18n';
import { Card, Chip, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';

/** Lists the gesture profile of every app and, on tap, what each gesture does there. */
export function ProfilesPanel({ registry }: { registry: ProfileRegistry }) {
  const ctx = useDescribeContext(registry);
  const { m } = ctx;
  const [openId, setOpenId] = useState<string | null>(null);
  const profiles = registry.list();

  return (
    <Card title={m.profiles.title} caption={m.profiles.caption}>
      {profiles.map((profile) => {
        const bindings = registry.bindings(profile.id);
        const own = bindings.filter((b) => !b.inherited).length;
        const expanded = openId === profile.id;
        return (
          <View key={profile.id} style={styles.profile}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setOpenId(expanded ? null : profile.id)}
              style={styles.header}>
              <View style={styles.titles}>
                <Text style={styles.name}>{ctx.appName(profile.id)}</Text>
                <Text style={textStyles.muted} numberOfLines={2}>
                  {profile.packages.length > 0 ? profile.packages.join(', ') : m.profiles.everyApp}
                </Text>
              </View>
              <Chip
                label={profile.id === GENERAL_PROFILE_ID ? m.profiles.gestures(own) : m.profiles.ownShared(own, bindings.length - own)}
                tone="accent"
              />
            </Pressable>
            {expanded
              ? bindings.map((binding) => (
                  <View key={binding.key} style={styles.binding}>
                    <Text style={styles.gesture}>{describeGesture(binding.key, m)}</Text>
                    <Text style={[styles.action, binding.inherited ? styles.inherited : null]}>
                      {describeAction(binding.action, ctx)}
                    </Text>
                  </View>
                ))
              : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  profile: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.border,
    paddingTop: tokens.space.md,
    gap: tokens.space.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md },
  titles: { flex: 1, gap: 2 },
  name: { color: tokens.color.text, fontSize: 15, fontWeight: '600' },
  binding: { flexDirection: 'row', justifyContent: 'space-between', gap: tokens.space.md, paddingLeft: tokens.space.sm },
  gesture: { color: tokens.color.textMuted, fontSize: 13, flexShrink: 1 },
  action: { color: tokens.color.text, fontSize: 13, fontWeight: '600', textAlign: 'right' },
  inherited: { color: tokens.color.textMuted, fontWeight: '400' },
});
