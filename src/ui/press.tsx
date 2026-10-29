import type { ReactNode } from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptic } from './haptics';
import { springs } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type PressFeedback = 'scale' | 'highlight' | 'none';

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /** How far the target shrinks while pressed. */
  scaleTo?: number;
  feedback?: PressFeedback;
  /** Which haptic plays on press. */
  haptics?: 'selection' | 'press' | 'none';
  /** Background shown while pressed, for list rows. */
  pressedColor?: string;
}

/**
 * The press feedback of every target: a short spring scale (spring.press) and
 * a haptic tick, or a background highlight for rows. With reduced motion the
 * scale becomes a quick dim.
 */
export function PressableScale({
  style,
  children,
  scaleTo = 0.97,
  feedback = 'scale',
  haptics = 'selection',
  pressedColor,
  disabled,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: PressableScaleProps) {
  const reduceMotion = useReducedMotion();
  const pressed = useSharedValue(0);

  const dimmed = disabled === true;
  const animated = useAnimatedStyle(() => {
    const p = pressed.get();
    if (dimmed) return { opacity: 0.4, transform: [{ scale: 1 }] };
    if (feedback === 'none') return { opacity: 1 };
    if (feedback === 'highlight' || reduceMotion) {
      return pressedColor
        ? { opacity: 1, backgroundColor: p > 0.5 ? pressedColor : 'transparent' }
        : { opacity: 1 - 0.28 * p, transform: [{ scale: 1 }] };
    }
    return { transform: [{ scale: 1 - (1 - scaleTo) * p }], opacity: 1 - 0.08 * p };
  });

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityState={{ ...rest.accessibilityState, disabled: disabled ?? undefined }}
      onPressIn={(event: GestureResponderEvent) => {
        pressed.set(reduceMotion || feedback === 'highlight' ? withTiming(1, { duration: 60 }) : withSpring(1, springs.press));
        onPressIn?.(event);
      }}
      onPressOut={(event: GestureResponderEvent) => {
        pressed.set(reduceMotion || feedback === 'highlight' ? withTiming(0, { duration: 160 }) : withSpring(0, springs.press));
        onPressOut?.(event);
      }}
      onPress={(event: GestureResponderEvent) => {
        if (haptics === 'selection') haptic.selection();
        else if (haptics === 'press') haptic.press();
        onPress?.(event);
      }}
      style={[style, animated]}>
      {children}
    </AnimatedPressable>
  );
}
