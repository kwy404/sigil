import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { createSpeechToText } from '../adapters/voice';
import { useI18n } from '../i18n';
import { PlanView } from '../screens/command/plan-view';
import { openSpecialAccess, type SpecialAccess } from '../screens/special-access';
import { CHECKLIST_GLYPH } from '../screens/status';
import { getSigil, planRequest } from '../session';
import type { SessionActions, SessionState } from '../session/types';
import type { PlanOutcome } from '../sigil-core';
import { GridBackdrop, Glow } from '../ui/backdrop';
import { Button, IconButton } from '../ui/button';
import { StatusChip, StatusDot } from '../ui/chip';
import { Glyph, type GlyphName } from '../ui/glyph';
import { HandPreview } from '../ui/hand-preview';
import { SigilMark } from '../ui/sigil-mark';
import { alpha, color, continuous } from '../ui/theme';
import { Txt } from '../ui/type';
import { OPTIONAL_STEPS, PERMISSION_ITEMS, type PermissionStep, type PracticeStep, type SpecialStep, type TourState } from './machine';

type Session = SessionState & SessionActions;

export function WelcomePage() {
  const { messages: m } = useI18n();
  const t = m.ui.tour.welcome;
  return (
    <View style={styles.center}>
      <View style={styles.markStage}>
        <Glow x={130} y={130} radius={150} opacity={0.2} />
        <SigilMark size={260} state="active" />
      </View>
      <Txt variant="hero" align="center" accessibilityRole="header">
        {t.title}
      </Txt>
      <Txt variant="headline" tone="accent" align="center" style={styles.tagline}>
        {t.tagline}
      </Txt>
      <Txt variant="body" tone="secondary" align="center" style={styles.lead}>
        {t.body}
      </Txt>
    </View>
  );
}

const FEATURE_GLYPHS: GlyphName[] = ['gesture-pinch', 'voice', 'confirm-action', 'privacy-shield'];

export function AboutPage() {
  const { messages: m } = useI18n();
  const t = m.ui.tour.about;
  return (
    <View style={styles.block}>
      <Txt variant="largeTitle" accessibilityRole="header">
        {t.title}
      </Txt>
      <View style={styles.features}>
        {t.features.map((feature, index) => (
          <Animated.View key={feature.title} entering={FadeIn.delay(80 * index).duration(260)} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Glyph name={FEATURE_GLYPHS[index] ?? 'sigil'} size={24} color={color.accent} />
            </View>
            <View style={styles.featureText}>
              <Txt variant="headline">{feature.title}</Txt>
              <Txt variant="callout" tone="secondary">
                {feature.body}
              </Txt>
            </View>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

function IconHero({ glyph, tone = 'accent' }: { glyph: GlyphName; tone?: 'accent' | 'warning' }) {
  const ink = tone === 'accent' ? color.accent : color.warning;
  return (
    <View style={styles.iconHero}>
      <Glow x={70} y={70} radius={90} tint={ink} opacity={0.18} />
      <View style={[styles.iconTile, continuous, { borderColor: alpha(ink, 0.35) }]}>
        <Glyph name={glyph} size={40} color={ink} />
      </View>
    </View>
  );
}

const SPECIAL_GLYPH: Record<SpecialStep, GlyphName> = { mediaAccess: 'play', writeSettings: 'sun-high' };

export function PermissionPage({
  step,
  session,
  state,
  special,
}: {
  step: PermissionStep;
  session: Session;
  state: TourState;
  special: SpecialAccess;
}) {
  const { messages: m } = useI18n();
  const t = m.ui.tour.permission;
  const item = PERMISSION_ITEMS[step];
  const text = m.ui.checklist[step];
  const known = item !== null ? session.checklist[item] : special[step as SpecialStep];
  const granted = known === true;
  const optional = (OPTIONAL_STEPS as readonly string[]).includes(step);
  const glyph: GlyphName = item !== null ? CHECKLIST_GLYPH[item] : SPECIAL_GLYPH[step as SpecialStep];
  const [helpOpen, setHelpOpen] = useState(false);
  const success = state.success === step;

  return (
    <View style={styles.block}>
      <IconHero glyph={glyph} />
      <View style={styles.titleRow}>
        <Txt variant="largeTitle" accessibilityRole="header" style={styles.flex}>
          {text.title}
        </Txt>
      </View>
      <View style={styles.chips}>
        {known === null ? (
          <StatusChip tone="neutral" label={m.ui.common.unknown} />
        ) : (
          <StatusChip tone={granted ? 'success' : 'warning'} label={granted ? m.ui.common.allowed : m.ui.common.missing} />
        )}
        {optional ? <StatusChip tone="neutral" label={m.ui.common.optional} /> : null}
      </View>
      <Txt variant="body" tone="secondary">
        {text.body}
      </Txt>
      <View style={styles.bullets}>
        {t.why[step].map((line) => (
          <View key={line} style={styles.bullet}>
            <Glyph name="check" size={16} color={color.accent} />
            <Txt variant="callout" tone="secondary" style={styles.flex}>
              {line}
            </Txt>
          </View>
        ))}
      </View>
      {step === 'accessibility' && !granted ? (
        <View style={[styles.help, continuous]}>
          <Button
            label={m.ui.settings.permissionsPage.restrictedHelp}
            variant="ghost"
            size="sm"
            trailingIcon={helpOpen ? 'chevron-up' : 'chevron-down'}
            onPress={() => setHelpOpen((open) => !open)}
            style={styles.helpToggle}
          />
          {helpOpen ? (
            <Animated.View entering={FadeIn.duration(200)} style={styles.helpBody}>
              {m.ui.settings.permissionsPage.restrictedSteps.map((line, index) => (
                <View key={line} style={styles.bullet}>
                  <Txt variant="mono" tone="accent">
                    {index + 1}
                  </Txt>
                  <Txt variant="callout" tone="secondary" style={styles.flex}>
                    {line}
                  </Txt>
                </View>
              ))}
              <Button label={m.ui.settings.permissionsPage.openAppInfo} variant="secondary" size="sm" onPress={() => session.fix('restrictedSettings')} />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
      {success ? (
        <Animated.View entering={ZoomIn.duration(220)} style={styles.successRow}>
          <Glyph name="check" size={18} color={color.success} />
          <Txt variant="subhead" tone="success">
            {t.granted}
          </Txt>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Opens the Android screen of a permission: the session fixes checklist items, the special accesses open their own screens. */
export function askPermission(step: PermissionStep, session: Session): void {
  const item = PERMISSION_ITEMS[step];
  if (item) {
    session.fix(item);
    return;
  }
  openSpecialAccess(step as SpecialStep);
}

export function permissionAction(step: PermissionStep, m: ReturnType<typeof useI18n>['messages']): string {
  const t = m.ui.tour.permission;
  switch (step) {
    case 'camera':
      return t.allowCamera;
    case 'microphone':
      return t.allowMicrophone;
    case 'accessibility':
      return t.openAccessibility;
    case 'overlay':
      return t.openOverlay;
    case 'notifications':
      return t.allowNotifications;
    case 'mediaAccess':
      return t.openMediaAccess;
    case 'writeSettings':
      return t.openWriteSettings;
  }
}

const PRACTICE_CLIP = {
  'practice-point': 'point',
  'practice-pinch': 'pinch',
  'practice-palm': 'open-palm',
  'practice-knob': 'volume-knob',
  'practice-fist': 'fist',
} as const;

const PRACTICE_TEXT = {
  'practice-point': 'point',
  'practice-pinch': 'pinch',
  'practice-palm': 'palm',
  'practice-knob': 'knob',
  'practice-fist': 'fist',
} as const;

export function PracticePage({
  step,
  session,
  state,
  screenReader,
  width,
}: {
  step: PracticeStep;
  session: Session;
  state: TourState;
  screenReader: boolean;
  width: number;
}) {
  const { messages: m } = useI18n();
  const t = m.ui.tour.practice;
  const album = PRACTICE_CLIP[step];
  const name = m.ui.gestures.albums[album].title;
  const done = state.status[step] === 'done';
  const watching = session.phase === 'tracking';
  const stage = Math.max(1, Math.min(width, 380));

  return (
    <View style={styles.block}>
      <View style={[styles.stage, continuous, { height: stage * 0.78 }]}>
        <GridBackdrop cell={20} opacity={0.08} fadeTo={color.surface} />
        <HandPreview clip={album} width={stage} height={stage * 0.78} live={!done} still={done} />
        {done ? (
          <Animated.View entering={ZoomIn.duration(240)} style={styles.stageBadge}>
            <Glyph name="check" size={28} color={color.accentInk} />
          </Animated.View>
        ) : null}
      </View>
      <Txt variant="largeTitle" accessibilityRole="header">
        {t.title(name)}
      </Txt>
      <Txt variant="body" tone="secondary">
        {t[PRACTICE_TEXT[step]]}
      </Txt>
      <View style={[styles.statusCard, continuous]} accessibilityLiveRegion="polite">
        {done ? (
          <>
            <StatusDot tone="success" />
            <Txt variant="subhead" tone="success" style={styles.flex}>
              {screenReader ? t.doneScreenReader : t.done}
            </Txt>
          </>
        ) : watching ? (
          <>
            <StatusDot tone="accent" live />
            <Txt variant="subhead" tone="secondary" style={styles.flex}>
              {t.waiting}
            </Txt>
          </>
        ) : (
          <>
            <StatusDot tone="neutral" />
            <Txt variant="subhead" tone="secondary" style={styles.flex}>
              {t.cameraOff}
            </Txt>
            <Button
              label={t.startCamera}
              size="sm"
              icon="play"
              loading={session.phase === 'starting'}
              onPress={() => void session.start()}
            />
          </>
        )}
      </View>
    </View>
  );
}

export function VoicePracticePage({ onPlanned }: { onPlanned: () => void }) {
  const { messages: m, speechLocale } = useI18n();
  const t = m.ui.tour.voice;
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ request: string; outcome: PlanOutcome } | null>(null);

  const [heardNothing, setHeardNothing] = useState(false);

  const plan = async (request: string) => {
    const clean = request.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const { outcome } = await planRequest(clean, { dryRun: true });
      setResult({ request: clean, outcome });
      if (outcome.status === 'planned') onPlanned();
    } finally {
      setBusy(false);
    }
  };

  const say = async () => {
    setListening(true);
    setHeardNothing(false);
    try {
      // The phone's recognizer where there is one; elsewhere a scripted engine that hears the sample.
      const engine = getSigil().native ? getSigil().speech : createSpeechToText([t.sample]);
      const transcript = await engine.listen({ locale: speechLocale, onPartial: setText });
      setText(transcript.text);
      await plan(transcript.text);
    } catch {
      setHeardNothing(true);
    } finally {
      setListening(false);
    }
  };

  return (
    <View style={styles.block}>
      <IconHero glyph="voice" />
      <Txt variant="largeTitle" accessibilityRole="header">
        {t.title}
      </Txt>
      <Txt variant="body" tone="secondary">
        {t.body}
      </Txt>
      <View style={[styles.sayRow, continuous]}>
        <IconButton icon="mic" label={t.say} onPress={() => void say()} active={listening} size={52} variant="tinted" />
        <View style={styles.flex}>
          <Txt variant="monoTag" tone="tertiary">
            {listening ? m.ui.command.listening : t.say}
          </Txt>
          <Txt variant="headline">{m.quote(t.sample)}</Txt>
        </View>
      </View>
      {heardNothing ? (
        <Txt variant="footnote" tone="warning">
          {m.ui.common.heardNothing}
        </Txt>
      ) : null}
      <Txt variant="monoTag" tone="tertiary">
        {t.type}
      </Txt>
      <View style={[styles.inputRow, continuous]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t.sample}
          placeholderTextColor={color.text3}
          style={styles.input}
          returnKeyType="go"
          onSubmitEditing={() => void plan(text || t.sample)}
          accessibilityLabel={t.type}
        />
        <Button label={t.tryIt} size="sm" loading={busy} onPress={() => void plan(text || t.sample)} />
      </View>
      {result ? (
        <View style={styles.resultBlock}>
          <PlanView outcome={result.outcome} request={result.request} />
          <Txt variant="footnote" tone="tertiary">
            {t.nothingRan}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}

export function ConfirmPracticePage({ state, onAnswer }: { state: TourState; onAnswer: (answer: 'yes' | 'no') => void }) {
  const { messages: m } = useI18n();
  const t = m.ui.tour.confirm;
  return (
    <View style={styles.block}>
      <IconHero glyph="confirm-action" tone="warning" />
      <Txt variant="largeTitle" accessibilityRole="header">
        {t.title}
      </Txt>
      <Txt variant="body" tone="secondary">
        {t.body}
      </Txt>
      <View style={[styles.confirmCard, continuous]}>
        <View style={styles.confirmHead}>
          <StatusChip tone="warning" label={m.ui.command.asksFirst} live={state.answer === null} />
        </View>
        <Txt variant="title2">{t.question}</Txt>
        {state.answer === null ? (
          <View style={styles.confirmButtons}>
            <Button label={t.yes} icon="check" onPress={() => onAnswer('yes')} style={styles.flexButton} />
            <Button label={t.no} icon="close" variant="secondary" onPress={() => onAnswer('no')} style={styles.flexButton} />
          </View>
        ) : (
          <Animated.View entering={FadeIn.duration(220)} style={styles.successRow}>
            <Glyph name={state.answer === 'yes' ? 'check' : 'close'} size={18} color={state.answer === 'yes' ? color.success : color.text2} />
            <Txt variant="callout" tone={state.answer === 'yes' ? 'success' : 'secondary'} style={styles.flex}>
              {state.answer === 'yes' ? t.answeredYes : t.answeredNo}
            </Txt>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

export function DonePage({ later }: { later: string[] }) {
  const { messages: m } = useI18n();
  const t = m.ui.tour.done;
  return (
    <View style={styles.block}>
      <View style={styles.doneMark}>
        <Glow x={90} y={90} radius={110} opacity={0.22} />
        <Animated.View entering={ZoomIn.springify().damping(14)} style={styles.doneRing}>
          <Glyph name="check" size={44} color={color.accentInk} />
        </Animated.View>
      </View>
      <Txt variant="hero" accessibilityRole="header">
        {t.title}
      </Txt>
      <Txt variant="body" tone="secondary">
        {t.body}
      </Txt>
      <View style={[styles.laterCard, continuous]}>
        <Txt variant="monoTag" tone="tertiary">
          {t.later}
        </Txt>
        {later.length === 0 ? (
          <View style={styles.bullet}>
            <Glyph name="check" size={16} color={color.success} />
            <Txt variant="callout" tone="secondary">
              {t.allDone}
            </Txt>
          </View>
        ) : (
          later.map((line) => (
            <View key={line} style={styles.bullet}>
              <StatusDot tone="warning" />
              <Txt variant="callout" tone="secondary" style={styles.flex}>
                {line}
              </Txt>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', gap: 8 },
  block: { gap: 14 },
  markStage: { width: 260, height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  tagline: { marginTop: 2 },
  lead: { maxWidth: 340, marginTop: 6 },
  features: { gap: 22, marginTop: 14 },
  feature: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  featureText: { flex: 1, gap: 3 },
  iconHero: { width: 140, height: 120, justifyContent: 'center', marginLeft: -26 },
  iconTile: {
    marginLeft: 26,
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface,
    borderWidth: 1,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  bullets: { gap: 10, marginTop: 4 },
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  help: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    backgroundColor: color.surface,
    padding: 6,
  },
  helpToggle: { alignSelf: 'stretch', justifyContent: 'space-between' },
  helpBody: { gap: 10, padding: 10, paddingTop: 2 },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stage: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageBadge: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  sayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 20,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 14,
    paddingRight: 6,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineFocus,
  },
  input: { flex: 1, color: color.text, fontSize: 16, fontFamily: 'Inter_400Regular', paddingVertical: 10 },
  resultBlock: { gap: 8 },
  confirmCard: {
    gap: 14,
    padding: 18,
    borderRadius: 22,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: alpha(color.warning, 0.3),
  },
  confirmHead: { flexDirection: 'row' },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  flexButton: { flex: 1, alignSelf: 'auto' },
  doneMark: { width: 180, height: 150, justifyContent: 'center', marginLeft: -40 },
  doneRing: {
    marginLeft: 40,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterCard: {
    gap: 10,
    padding: 16,
    borderRadius: 18,
    backgroundColor: color.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairlineStrong,
  },
});
