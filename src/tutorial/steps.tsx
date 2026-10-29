import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  PixelRatio,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type HostInstance,
  type LayoutRectangle,
} from 'react-native';

import { createSpeechToText } from '../adapters/voice';
import type { ProfileRegistry } from '../app-profiles';
import type { SampleId } from '../gesture-engine';
import { subscribeGestures, type LiveGesture } from '../hand-control/feed';
import { describeAction, describeNotice, describePlan, describeStep, describeGesture, useDescribeContext, useI18n } from '../i18n';
import { ActionPlanner, type PlanOutcome } from '../sigil-core';
import { foregroundApp, getNativeControl, installedApps, planPlatform } from '../system-control';
import { Icon } from '../ui/icon';
import type { IconName } from '../ui/icons';
import { Button, textStyles } from '../ui/primitives';
import { tokens } from '../ui/tokens';
import { accessGranted, canAskForAccess, needsRestrictedSettings, requestAccess } from './access';
import { HandDemo } from './hand-demo';
import type { AccessStep, TutorialStep } from './machine';

export const STEP_ICONS: Record<TutorialStep, IconName> = {
  welcome: 'privacy-shield',
  camera: 'camera-tracking',
  microphone: 'voice',
  accessibility: 'accessibility',
  overlay: 'cursor',
  media_access: 'quick-actions',
  write_settings: 'settings',
  practice_point: 'gesture-point',
  practice_pinch: 'gesture-pinch',
  practice_palm: 'gesture-open-palm',
  practice_knob: 'gesture-circle-cw',
  practice_fist: 'gesture-fist',
  voice: 'listening',
  confirm: 'confirm-action',
  profiles: 'app-profile',
  done: 'sphere',
};

export const PRACTICE_SAMPLES: Partial<Record<TutorialStep, SampleId>> = {
  practice_point: 'point',
  practice_pinch: 'pinch',
  practice_palm: 'open-palm',
  practice_knob: 'pinch-circle-cw',
  practice_fist: 'fist',
};

/** The seconds a confirmation waits for an answer before it cancels. */
export const CONFIRM_SECONDS = 8;

export function StepHeader({ step, title }: { step: TutorialStep; title: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.iconBox}>
        <Icon name={STEP_ICONS[step]} size={40} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

/** One permission or special access: why it is needed, its state and the button that asks for it. */
export function AccessStepView({ step, onGranted }: { step: AccessStep; onGranted: () => void }) {
  const { messages: m } = useI18n();
  const t = m.tutorial;
  const copy = t.steps[step];
  const [granted, setGranted] = useState<boolean | null>(null);
  const restricted = step === 'accessibility' && granted === false && needsRestrictedSettings();
  const known = useRef<boolean | null>(null);

  const check = useCallback(async () => {
    const now = await accessGranted(step);
    // Moving on only when the access changes here, not when it was already there.
    if (now && known.current === false) onGranted();
    known.current = now;
    setGranted(now);
  }, [step, onGranted]);

  useEffect(() => {
    known.current = null;
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    return () => subscription.remove();
  }, [check]);

  const ask = async () => {
    const result = await requestAccess(step);
    if (result !== null) await check();
  };

  return (
    <View style={styles.body}>
      <StepHeader step={step} title={copy.title} />
      <Text style={textStyles.body}>{copy.body}</Text>
      {granted ? (
        <Text style={[styles.status, styles.good]} accessibilityLiveRegion="polite">
          {t.allowed}
        </Text>
      ) : canAskForAccess(step) ? (
        <Button label={copy.button} onPress={ask} />
      ) : (
        <Text style={textStyles.muted}>{t.notInBuild}</Text>
      )}
      {restricted ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t.restrictedTitle}</Text>
          <Text style={textStyles.body}>{m.system.restricted}</Text>
          <Button label={m.system.buttons.appInfo} tone="warning" onPress={() => getNativeControl()?.openAppInfo()} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * A gesture to practice: the recorded demo plays, and with live tracking the
 * step moves on when the gesture is seen. The pinch step has a target; a
 * pinch counts when the cursor is on it, and a real tap on it counts too.
 */
export function PracticeStepView({
  step,
  live,
  reached,
  onTargetLayout,
  onTargetPressed,
}: {
  step: TutorialStep;
  live: boolean;
  reached: boolean;
  onTargetLayout: (rect: LayoutRectangle | null) => void;
  onTargetPressed: () => void;
}) {
  const { messages: m } = useI18n();
  const t = m.tutorial;
  const copy = t.steps[step as 'practice_point'];
  const sample = PRACTICE_SAMPLES[step];
  const target = useRef<HostInstance>(null);

  const measure = () => {
    target.current?.measureInWindow((x, y, width, height) => {
      const scale = PixelRatio.get();
      onTargetLayout({ x: x * scale, y: y * scale, width: width * scale, height: height * scale });
    });
  };

  useEffect(() => () => onTargetLayout(null), [onTargetLayout]);

  return (
    <View style={styles.body}>
      <StepHeader step={step} title={copy.title} />
      <Text style={textStyles.body}>{copy.body}</Text>
      <View style={styles.demo}>{sample ? <HandDemo sample={sample} size={180} /> : null}</View>
      {step === 'practice_pinch' ? (
        <Pressable
          ref={target}
          onLayout={measure}
          onPress={onTargetPressed}
          accessibilityRole="button"
          accessibilityLabel={t.steps.practice_pinch.target}
          style={({ pressed }) => [styles.target, pressed || reached ? styles.targetHit : null]}>
          <Text style={styles.targetText}>{t.steps.practice_pinch.target}</Text>
        </Pressable>
      ) : null}
      <Text style={[styles.status, reached ? styles.good : null]} accessibilityLiveRegion="polite">
        {reached ? t.gotIt : live ? t.waiting : t.noTracking}
      </Text>
    </View>
  );
}

/** Says a request or types it, and shows the plan Sigil would run without running it. */
export function VoiceStepView({ registry, onPracticed }: { registry: ProfileRegistry; onPracticed: () => void }) {
  const { messages: m, speechLocale } = useI18n();
  const ctx = useDescribeContext(registry);
  const copy = m.tutorial.steps.voice;
  const planner = useMemo(() => new ActionPlanner({ profiles: registry, installedApps, platform: planPlatform() }), [registry]);
  const speech = useMemo(() => createSpeechToText([copy.example]), [copy.example]);
  const [typed, setTyped] = useState('');
  const [heard, setHeard] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null);
  const [listening, setListening] = useState(false);

  const show = async (text: string) => {
    if (!text.trim()) return;
    setHeard(text);
    // A dry run: the plan is only shown, never given to the executor.
    setOutcome(await planner.plan({ text, locale: speechLocale, foregroundPackage: foregroundApp() }));
    onPracticed();
  };

  const listen = async () => {
    setListening(true);
    try {
      const transcript = await speech.listen({ locale: speechLocale, onPartial: setHeard });
      await show(transcript.text);
    } catch {
      setHeard(null);
    } finally {
      setListening(false);
    }
  };

  return (
    <View style={styles.body}>
      <StepHeader step="voice" title={copy.title} />
      <Text style={textStyles.body}>{copy.body(copy.example)}</Text>
      <Button label={listening ? m.planner.listening : copy.listen} onPress={listen} disabled={listening} />
      <View style={styles.inputRow}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={() => show(typed)}
          placeholder={copy.placeholder}
          placeholderTextColor={tokens.color.textMuted}
          accessibilityLabel={copy.placeholder}
          returnKeyType="go"
          style={styles.input}
        />
        <Button label={copy.show} onPress={() => show(typed)} disabled={!typed.trim()} />
      </View>
      {heard ? <Text style={textStyles.body}>{m.quote(heard)}</Text> : null}
      {outcome ? (
        <View style={styles.plan} accessibilityLiveRegion="polite">
          {outcome.status === 'planned' ? (
            <>
              <Text style={styles.planTitle}>{describePlan(outcome.plan, ctx)}</Text>
              {outcome.plan.steps.map((step, index) => (
                <Text key={`${index}-${step.kind}`} style={textStyles.muted}>
                  {index + 1}. {describeStep(step, ctx, outcome.plan, index)}
                </Text>
              ))}
            </>
          ) : (
            <Text style={textStyles.body}>
              {outcome.status === 'clarify' ? outcome.question : describeNotice(outcome.notice, ctx)}
            </Text>
          )}
          <Text style={[styles.status, styles.warn]}>{copy.dryRun}</Text>
        </View>
      ) : null}
    </View>
  );
}

type ConfirmAnswer = 'pending' | 'confirmed' | 'cancelled' | 'timed_out';

/** A practice confirmation: pinch or Yes confirms, fist or No cancels, eight silent seconds cancel. */
export function ConfirmStepView({ onPracticed }: { onPracticed: () => void }) {
  const { messages: m } = useI18n();
  const copy = m.tutorial.steps.confirm;
  const [answer, setAnswer] = useState<ConfirmAnswer>('pending');
  const [left, setLeft] = useState(CONFIRM_SECONDS);
  const [round, setRound] = useState(0);

  const settle = useCallback(
    (next: ConfirmAnswer) => {
      setAnswer((current) => (current === 'pending' ? next : current));
      onPracticed();
    },
    [onPracticed],
  );

  useEffect(() => {
    setAnswer('pending');
    setLeft(CONFIRM_SECONDS);
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = CONFIRM_SECONDS - Math.floor((Date.now() - started) / 1000);
      setLeft(Math.max(0, remaining));
      if (remaining <= 0) {
        clearInterval(timer);
        settle('timed_out');
      }
    }, 250);
    const unsubscribe = subscribeGestures(({ event }: LiveGesture) => {
      if (event.kind === 'pinch') settle('confirmed');
      if (event.kind === 'fist') settle('cancelled');
    });
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [round, settle]);

  const result =
    answer === 'confirmed' ? copy.confirmed : answer === 'cancelled' ? copy.cancelled : answer === 'timed_out' ? copy.timedOut : null;

  return (
    <View style={styles.body}>
      <StepHeader step="confirm" title={copy.title} />
      <Text style={textStyles.body}>{copy.body}</Text>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{m.confirm.send(copy.sampleText, copy.sampleContact, 'WhatsApp')}</Text>
        {answer === 'pending' ? (
          <>
            <Text style={textStyles.muted}>{copy.countdown(left)}</Text>
            <View style={styles.row}>
              <Button label={m.planner.yes} tone="success" onPress={() => settle('confirmed')} />
              <Button label={m.planner.no} tone="danger" onPress={() => settle('cancelled')} />
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.status, answer === 'confirmed' ? styles.good : styles.warn]} accessibilityLiveRegion="polite">
              {result}
            </Text>
            <Button label={copy.again} tone="neutral" onPress={() => setRound((n) => n + 1)} />
          </>
        )}
      </View>
    </View>
  );
}

/** A few bindings of the bundled app profiles, to show that a gesture means what the app needs. */
export function ProfilesStepView({ registry }: { registry: ProfileRegistry }) {
  const { messages: m } = useI18n();
  const ctx = useDescribeContext(registry);
  const copy = m.tutorial.steps.profiles;
  const examples = ['youtube', 'instagram', 'whatsapp'].flatMap((id) => {
    const profile = registry.get(id);
    if (!profile) return [];
    const own = registry.bindings(id).filter((binding) => !binding.inherited).slice(0, 2);
    return [{ id, name: ctx.appName(id), own }];
  });
  return (
    <View style={styles.body}>
      <StepHeader step="profiles" title={copy.title} />
      <Text style={textStyles.body}>{copy.body}</Text>
      {examples.map((example) => (
        <View key={example.id} style={styles.profile}>
          <Text style={styles.planTitle}>{example.name}</Text>
          {example.own.map((binding) => (
            <Text key={binding.key} style={textStyles.muted}>
              {describeGesture(binding.key, m)}: {describeAction(binding.action, ctx)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: tokens.space.md },
  header: { gap: tokens.space.md, alignItems: 'flex-start' },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: tokens.color.text, fontSize: 24, fontWeight: '700' },
  status: { color: tokens.color.textMuted, fontSize: 14, fontWeight: '600' },
  good: { color: tokens.color.success },
  warn: { color: tokens.color.warning },
  notice: {
    gap: tokens.space.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.warning,
    padding: tokens.space.md,
  },
  noticeTitle: { color: tokens.color.text, fontSize: 15, fontWeight: '600' },
  demo: { alignItems: 'center' },
  target: {
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    borderColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetHit: { backgroundColor: tokens.color.accentSoft },
  targetText: { color: tokens.color.accent, fontSize: 15, fontWeight: '600' },
  inputRow: { gap: tokens.space.sm },
  input: {
    color: tokens.color.text,
    backgroundColor: tokens.color.surfaceRaised,
    borderColor: tokens.color.border,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    fontSize: 15,
  },
  plan: { gap: tokens.space.xs, padding: tokens.space.md, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surfaceRaised },
  planTitle: { color: tokens.color.text, fontSize: 15, fontWeight: '600' },
  profile: { gap: 2 },
  row: { flexDirection: 'row', gap: tokens.space.sm, flexWrap: 'wrap' },
});
