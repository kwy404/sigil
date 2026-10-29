import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useReducer, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n';
import { usePreferences } from '../preferences/provider';
import { useSigilSession } from '../session';
import { readSpecialAccess, useSpecialAccess } from '../screens/special-access';
import { Glow, GridBackdrop } from '../ui/backdrop';
import { Button } from '../ui/button';
import { Glyph } from '../ui/glyph';
import { haptic } from '../ui/haptics';
import { PressableScale } from '../ui/press';
import { color, GUTTER, springs } from '../ui/theme';
import { Txt } from '../ui/type';
import {
  completionRecord,
  currentStep,
  isPermissionStep,
  isPracticeStep,
  leftForLater,
  progress,
  startTour,
  tourReducer,
  type TourStep,
} from './machine';
import {
  AboutPage,
  askPermission,
  ConfirmPracticePage,
  DonePage,
  PermissionPage,
  permissionAction,
  PracticePage,
  VoicePracticePage,
  WelcomePage,
} from './tour-pages';

const SUCCESS_HOLD_MS = 1200;

/**
 * The first run tutorial as full screen pages, like a welcome sheet: Back,
 * progress and Skip always at the top, one idea per page, and the main action
 * at the bottom. It listens to the session, so a granted permission or a
 * practiced sign moves on by itself, except with a screen reader, where the
 * person moves on with Next.
 */
export function TourScreen() {
  const params = useLocalSearchParams<{ replay?: string }>();
  const { messages: m } = useI18n();
  const session = useSigilSession();
  const preferences = usePreferences();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const replay = params.replay === '1';
  const special = useSpecialAccess();
  const [state, dispatch] = useReducer(tourReducer, null, () =>
    startTour({ androidAccess: Platform.OS !== 'ios', checklist: session.checklist, special: readSpecialAccess(), replay }),
  );
  const [screenReader, setScreenReader] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const step = currentStep(state);
  const { index, total, fraction } = progress(state);
  const t = m.ui.tour;

  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (session.lastGesture) dispatch({ type: 'gesture', key: session.lastGesture });
  }, [session.lastGesture]);

  useEffect(() => {
    dispatch({ type: 'checklist', checklist: session.checklist });
  }, [session.checklist]);

  useEffect(() => {
    if (special.mediaAccess) dispatch({ type: 'access', step: 'mediaAccess' });
    if (special.writeSettings) dispatch({ type: 'access', step: 'writeSettings' });
  }, [special.mediaAccess, special.writeSettings]);

  useEffect(() => {
    if (!state.success) return;
    haptic.success();
    if (screenReader) return;
    const timer = setTimeout(() => dispatch({ type: 'advance' }), SUCCESS_HOLD_MS);
    return () => clearTimeout(timer);
  }, [state.success, screenReader]);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [step]);

  useEffect(() => {
    if (!state.finished) return;
    preferences.completeTour(completionRecord(state, Date.now()));
    if (replay && router.canGoBack()) router.back();
    else router.replace('/');
  }, [state, preferences, replay]);

  const bar = useAnimatedStyle(() => ({ width: withSpring(`${Math.max(4, fraction * 100)}%`, springs.glide) }));

  // Each page fades and rises in. A plain animated style rather than a layout animation, which
  // left the first page invisible on Android.
  const reduceMotion = useReducedMotion();
  const appear = useSharedValue(1);
  useEffect(() => {
    appear.set(reduceMotion ? 1 : withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 300 })));
  }, [step, reduceMotion, appear]);
  const pageStyle = useAnimatedStyle(() => ({
    opacity: appear.get(),
    transform: [{ translateY: (1 - appear.get()) * 10 }],
  }));

  const labelOf = (candidate: TourStep): string => {
    if (isPermissionStep(candidate)) return m.ui.checklist[candidate].title;
    if (isPracticeStep(candidate)) {
      const album = { 'practice-point': 'point', 'practice-pinch': 'pinch', 'practice-palm': 'open-palm', 'practice-knob': 'volume-knob', 'practice-fist': 'fist' } as const;
      return m.ui.gestures.albums[album[candidate]].title;
    }
    if (candidate === 'voice') return t.voice.title;
    if (candidate === 'confirm') return t.confirm.title;
    return candidate;
  };

  const page = () => {
    if (step === 'welcome') return <WelcomePage />;
    if (step === 'about') return <AboutPage />;
    if (isPermissionStep(step)) return <PermissionPage step={step} session={session} state={state} special={special} />;
    if (isPracticeStep(step))
      return <PracticePage step={step} session={session} state={state} screenReader={screenReader} width={width - GUTTER * 2} />;
    if (step === 'voice') return <VoicePracticePage onPlanned={() => dispatch({ type: 'practiced' })} />;
    if (step === 'confirm') return <ConfirmPracticePage state={state} onAnswer={(answer) => dispatch({ type: 'answer', answer })} />;
    return <DonePage later={leftForLater(state).map(labelOf)} />;
  };

  const primary = () => {
    if (step === 'welcome') return <Button label={t.welcome.start} size="lg" block onPress={() => dispatch({ type: 'next' })} />;
    if (step === 'done') return <Button label={t.done.finish} size="lg" block onPress={() => dispatch({ type: 'finish' })} />;
    if (isPermissionStep(step) && state.status[step] !== 'done') {
      return (
        <Button
          label={permissionAction(step, m)}
          size="lg"
          block
          trailingIcon="arrow-up-right"
          onPress={() => askPermission(step, session)}
        />
      );
    }
    const doneHere = state.status[step] === 'done';
    return (
      <Button
        label={doneHere ? m.ui.common.continue : m.ui.common.next}
        size="lg"
        block
        variant={doneHere || step === 'about' ? 'primary' : 'secondary'}
        onPress={() => dispatch({ type: 'next' })}
      />
    );
  };

  const secondary = () => {
    if (step === 'welcome') return <Button label={t.skipAll} variant="ghost" block onPress={() => dispatch({ type: 'skipAll' })} />;
    if (isPermissionStep(step) && state.status[step] !== 'done') {
      return <Button label={m.ui.common.notNow} variant="ghost" block onPress={() => dispatch({ type: 'skip' })} />;
    }
    return null;
  };

  const canBack = index > 0 || replay;

  return (
    <View style={styles.root}>
      <GridBackdrop cell={26} opacity={0.05} center={{ x: 0.5, y: 0.18 }} />
      <Glow x={width / 2} y={insets.top + 60} radius={width * 0.75} opacity={0.08} />
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={m.ui.common.back}
          disabled={!canBack}
          onPress={() => (index > 0 ? dispatch({ type: 'back' }) : router.back())}
          hitSlop={8}
          style={styles.topButton}>
          <Glyph name="chevron-left" size={22} color={color.text} />
          <Txt variant="subhead" numberOfLines={1}>
            {m.ui.common.back}
          </Txt>
        </PressableScale>
        <View
          style={styles.progressWrap}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t.progress(index + 1, total)}
          accessibilityValue={{ min: 1, max: total, now: index + 1 }}>
          <View style={styles.track}>
            <Animated.View style={[styles.fill, bar]} />
          </View>
          <Txt variant="monoTag" tone="tertiary" align="center">
            {`${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`}
          </Txt>
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={m.ui.common.skip}
          onPress={() => dispatch({ type: 'skip' })}
          hitSlop={8}
          style={[styles.topButton, styles.topRight]}>
          <Txt variant="subhead" tone="accent" numberOfLines={1}>
            {m.ui.common.skip}
          </Txt>
        </PressableScale>
      </View>
      <ScrollView ref={scroll} style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Animated.View style={pageStyle}>
          {page()}
        </Animated.View>
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
        {primary()}
        {secondary()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.canvas },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  topButton: { flexDirection: 'row', alignItems: 'center', minHeight: 44, minWidth: 84, gap: 2 },
  topRight: { justifyContent: 'flex-end', paddingRight: 8 },
  progressWrap: { flex: 1, gap: 6, alignItems: 'stretch' },
  track: { height: 4, borderRadius: 2, backgroundColor: color.hairlineStrong, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: color.accent },
  content: { paddingHorizontal: GUTTER, paddingTop: 18, paddingBottom: 24 },
  bottom: { paddingHorizontal: GUTTER, paddingTop: 10, gap: 6, backgroundColor: color.canvas },
});
