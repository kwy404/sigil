import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileRegistry } from '../app-profiles';
import { beginPractice, subscribeGestures, useLiveTracking } from '../hand-control/feed';
import { useI18n } from '../i18n';
import { readSettings, updateSettings } from '../settings/store';
import { getNativeControl } from '../system-control';
import { Button, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';
import {
  ACCESS_STEPS,
  currentStep,
  OPTIONAL_STEPS,
  PRACTICE_GESTURES,
  startTutorial,
  toSaved,
  tutorialProgress,
  tutorialReducer,
  type AccessStep,
  type TutorialPlatform,
  type TutorialStep,
} from './machine';
import { AccessStepView, ConfirmStepView, PracticeStepView, ProfilesStepView, StepHeader, VoiceStepView } from './steps';

function tutorialPlatform(): TutorialPlatform {
  return Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';
}

function isAccessStep(step: TutorialStep): step is AccessStep {
  return (ACCESS_STEPS as readonly string[]).includes(step);
}

/**
 * The guided tour: permissions with the reason for each, gesture practice,
 * a voice dry run, confirmation practice, profiles and the end. Back, skip and
 * progress are always on screen; the place is saved after every step so the
 * tour resumes there, and finishing or skipping it leads to the main screen.
 */
export function TutorialScreen({ replay }: { replay: boolean }) {
  const { messages: m } = useI18n();
  const t = m.tutorial;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const registry = useMemo(() => ProfileRegistry.withBuiltins(), []);
  const live = useLiveTracking();
  const [state, dispatch] = useReducer(tutorialReducer, undefined, () =>
    startTutorial(readSettings().tutorial, tutorialPlatform(), { replay }),
  );
  const step = currentStep(state);
  const { index, total } = tutorialProgress(state);
  const target = useRef<LayoutRectangle | null>(null);

  useEffect(() => {
    updateSettings({ tutorial: toSaved(state) });
    if (state.closed) {
      router.replace('/');
    }
  }, [state, router]);

  // While the tour is open, gestures are practice: no taps, sphere or listening.
  useEffect(() => beginPractice(), []);

  useEffect(
    () =>
      subscribeGestures(({ event, cursor }) => {
        const box = target.current;
        const onTarget =
          box && cursor ? cursor.x >= box.x && cursor.x <= box.x + box.width && cursor.y >= box.y && cursor.y <= box.y + box.height : false;
        dispatch({ type: 'gesture', gesture: event.kind, onTarget });
      }),
    [],
  );

  // Practice needs frames: start the camera service when the camera is allowed.
  useEffect(() => {
    if (!PRACTICE_GESTURES[step]) return;
    const native = getNativeControl();
    if (native && !native.getStatus().cameraServiceRunning) {
      native.startCameraService(false);
    }
  }, [step]);

  const title = step === 'done' ? t.steps.done.title : t.steps[step].title;
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${t.progress(index + 1, total)}. ${title}`);
  }, [index, total, title, t]);

  const granted = useCallback((access: AccessStep) => dispatch({ type: 'granted', step: access }), []);
  const practiced = useCallback(() => dispatch({ type: 'practiced' }), []);
  const setTarget = useCallback((rect: LayoutRectangle | null) => {
    target.current = rect;
  }, []);

  const skippedTitles = state.skipped.map((skipped) => (skipped === 'done' ? '' : t.steps[skipped].title)).filter(Boolean);

  const body = (() => {
    if (isAccessStep(step)) {
      return <AccessStepView key={step} step={step} onGranted={() => granted(step)} />;
    }
    if (PRACTICE_GESTURES[step]) {
      return (
        <PracticeStepView
          key={step}
          step={step}
          live={live}
          reached={state.reached.includes(step)}
          onTargetLayout={setTarget}
          onTargetPressed={() => dispatch({ type: 'gesture', gesture: 'pinch', onTarget: true })}
        />
      );
    }
    switch (step) {
      case 'voice':
        return <VoiceStepView registry={registry} onPracticed={practiced} />;
      case 'confirm':
        return <ConfirmStepView onPracticed={practiced} />;
      case 'profiles':
        return <ProfilesStepView registry={registry} />;
      case 'done':
        return (
          <View style={styles.body}>
            <StepHeader step="done" title={t.steps.done.title} />
            <Text style={textStyles.body}>{t.steps.done.body}</Text>
            {skippedTitles.length > 0 ? <Text style={textStyles.muted}>{t.steps.done.skipped(skippedTitles.join(', '))}</Text> : null}
          </View>
        );
      default:
        return (
          <View style={styles.body}>
            <StepHeader step={step} title={t.steps.welcome.title} />
            <Text style={textStyles.body}>{t.steps.welcome.body}</Text>
          </View>
        );
    }
  })();

  const last = step === 'done';
  return (
    <View style={[styles.screen, { paddingTop: insets.top + tokens.space.md, paddingBottom: insets.bottom + tokens.space.md }]}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <Text style={styles.label}>{t.label}</Text>
          <Text style={styles.progress}>{t.progress(index + 1, total)}</Text>
        </View>
        {last ? null : (
          <Pressable accessibilityRole="button" onPress={() => dispatch({ type: 'skip_all' })} hitSlop={12}>
            <Text style={styles.skipAll}>{t.skipAll}</Text>
          </Pressable>
        )}
      </View>
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t.progress(index + 1, total)}
        accessibilityValue={{ min: 1, max: total, now: index + 1 }}>
        <View style={[styles.fill, { width: `${((index + 1) / total) * 100}%` }]} />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {body}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={t.back} tone="neutral" onPress={() => dispatch({ type: 'back' })} disabled={index === 0} />
        {step === 'welcome' || last ? null : (
          <Button label={OPTIONAL_STEPS.includes(step) ? t.notNow : t.skip} tone="neutral" onPress={() => dispatch({ type: 'skip' })} />
        )}
        <Button label={last ? t.start : t.next} onPress={() => dispatch({ type: last ? 'finish' : 'next' })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: tokens.color.background, paddingHorizontal: tokens.space.xl, gap: tokens.space.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: tokens.space.md },
  topText: { flex: 1, gap: 2 },
  label: { color: tokens.color.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  progress: { color: tokens.color.textMuted, fontSize: 13 },
  skipAll: { color: tokens.color.textMuted, fontSize: 14, fontWeight: '600' },
  track: { height: 4, borderRadius: 2, backgroundColor: tokens.color.border, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: tokens.color.accent },
  scroll: { flex: 1 },
  content: { paddingVertical: tokens.space.lg },
  body: { gap: tokens.space.md },
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.space.sm, justifyContent: 'flex-end' },
});
