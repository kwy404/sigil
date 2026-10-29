import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptics as the design system maps them: a selection tick for small choices,
 * a light impact for presses, notifications for done, warning and error. The
 * in app switch (Settings) turns all of them off; the web has none.
 */
let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

function run(effect: () => Promise<void>): void {
  if (!enabled || Platform.OS === 'web') {
    return;
  }
  effect().catch(() => {
    // A phone without a vibration motor or with haptics off in the system.
  });
}

let lastTick = 0;

export const haptic = {
  /** Moving onto a choice: at most one tick per 80 ms. */
  selection(): void {
    const now = Date.now();
    if (now - lastTick < 80) return;
    lastTick = now;
    run(() => Haptics.selectionAsync());
  },
  press(): void {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  heavy(): void {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
  soft(): void {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft));
  },
  success(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  warning(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  error(): void {
    run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};
