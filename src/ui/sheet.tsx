import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { haptic } from './haptics';
import { color, continuous, radius, springs } from './theme';

export interface SheetProps {
  children: (close: () => void) => ReactNode;
  /** Accessible name of the dismiss area behind the sheet. */
  closeLabel: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A full height sheet over the tabs, as Now Playing: it springs up from the
 * bottom, follows the finger when dragged by its top, and closes with a
 * flick down, a tap above it or the back button. Reduced motion fades it.
 */
export function Sheet({ children, closeLabel, style }: SheetProps) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const offset = useSharedValue(reduceMotion ? 0 : height);
  const fade = useSharedValue(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    haptic.soft();
    fade.set(withTiming(1, { duration: 260 }));
    offset.set(reduceMotion ? 0 : withSpring(0, springs.glide));
  }, [fade, offset, reduceMotion]);

  const finish = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const close = () => {
    if (closing) return;
    setClosing(true);
    fade.set(withTiming(0, { duration: 220 }));
    if (reduceMotion) {
      setTimeout(finish, 200);
      return;
    }
    offset.set(withSpring(height, { ...springs.settle, overshootClamping: true }));
    setTimeout(finish, 260);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  });

  const drag = usePanGesture({
    activeOffsetY: [-6, 6],
    onUpdate: (event) => {
      'worklet';
      offset.set(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      'worklet';
      if (event.translationY > 140 || event.velocityY > 900) {
        scheduleOnRN(close);
      } else {
        offset.set(withSpring(0, springs.glide));
      }
    },
  });

  const panel = useAnimatedStyle(() => ({ transform: [{ translateY: offset.get() }] }));
  const backdrop = useAnimatedStyle(() => ({ opacity: fade.get() * (1 - Math.min(1, offset.get() / height) * 0.6) }));

  const top = insets.top + 10;

  return (
    <View style={styles.root}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={closeLabel} />
      </Animated.View>
      <Animated.View style={[styles.panel, continuous, { top }, panel, style]}>
        <GestureDetector gesture={drag}>
          <View style={styles.handleZone} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={styles.grabber} />
          </View>
        </GestureDetector>
        {children(close)}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: color.scrim },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.canvasDeep,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    borderColor: color.hairlineStrong,
    overflow: 'hidden',
  },
  handleZone: { height: 28, alignItems: 'center', justifyContent: 'center' },
  grabber: { width: 38, height: 5, borderRadius: 3, backgroundColor: 'rgba(186, 214, 255, 0.28)' },
});
