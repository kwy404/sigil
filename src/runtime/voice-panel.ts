import type { PromptTone } from '../../modules/sigil-control';
import { describeConfirmation, describeFailure, describeNotice, describePlan, describeStep, type DescribeContext } from '../i18n';
import type { UnavailableReason } from '../adapters/voice';
import type { VoiceState } from '../voice/session';

export interface PanelContent {
  title: string;
  message: string;
  /** Microphone level from 0 to 1, or -1 to hide the meter. */
  level: number;
  tone: PromptTone;
}

/** How long the panel keeps the end of a request on screen, in milliseconds. */
export const PANEL_LINGER_MS = 3500;

type Done = Extract<VoiceState, { phase: 'done' }>;

function doneText({ outcome, result }: Done, ctx: DescribeContext): string {
  const { m } = ctx;
  if (outcome.status === 'clarify') return outcome.question;
  if (outcome.status === 'not_understood') return m.voice.notUnderstood;
  if (outcome.status !== 'planned') return describeNotice(outcome.notice, ctx);
  if (!result) return describePlan(outcome.plan, ctx);
  if (result.status === 'completed') return m.planner.result.completed;
  const step = outcome.plan.steps[result.completedSteps];
  const reason = describeFailure(result, step, ctx);
  if (reason) return reason;
  if (result.permission) return result.permission === 'write_settings' ? m.system.access.brightness : m.system.access.media;
  if (result.status === 'cancelled') return m.planner.result.cancelled;
  if (result.status === 'refused') return m.planner.result.refused;
  return m.planner.result.failed(step ? describeStep(step, ctx, outcome.plan, result.completedSteps) : '');
}

function unavailableText(reason: UnavailableReason, ctx: DescribeContext): string {
  const texts = ctx.m.voice.unavailable;
  return reason in texts ? texts[reason as keyof typeof texts] : texts.failed;
}

/**
 * What the panel at the top of the screen shows for a voice request made
 * while another app is in front, or null to hide it. The texts are the ones
 * Sigil's own screen uses, in the app language.
 */
export function voicePanel(state: VoiceState, busy: boolean, ctx: DescribeContext): PanelContent | null {
  const { m } = ctx;
  switch (state.phase) {
    case 'idle':
      return null;
    case 'listening': {
      const hint = state.noisy ? m.voice.tooNoisy : state.retry ? m.voice.repeat : '';
      return { title: m.voice.prompt.listening, message: state.partial ?? hint, level: state.level, tone: 'listening' };
    }
    case 'thinking':
      return { title: m.voice.prompt.done, message: m.voice.thinking(state.heard), level: -1, tone: 'info' };
    case 'repeat': {
      const message = !busy ? m.voice.gaveUp : state.noisy ? m.voice.tooNoisy : m.voice.repeat;
      return { title: m.voice.prompt.done, message, level: -1, tone: 'warning' };
    }
    case 'choose':
      return {
        title: m.voice.prompt.question,
        message: [describeNotice(state.outcome.notice, ctx), `${m.voice.chooseHint} ${m.voice.seconds(state.secondsLeft)}`].join('\n'),
        level: state.level,
        tone: 'question',
      };
    case 'confirm': {
      const lines = [describeConfirmation(state.plan, state.index, ctx)];
      if (state.unsure) lines.push(m.voice.unsure(state.heard));
      lines.push(`${m.voice.answerHint} ${m.voice.seconds(state.secondsLeft)}`);
      return { title: m.voice.prompt.question, message: lines.join('\n'), level: state.level, tone: 'question' };
    }
    case 'running':
      return { title: m.voice.prompt.done, message: describePlan(state.plan, ctx), level: -1, tone: 'info' };
    case 'done': {
      const ok = state.outcome.status === 'planned' && (state.result === null || state.result.status === 'completed');
      return { title: m.voice.prompt.done, message: doneText(state, ctx), level: -1, tone: ok ? 'info' : 'warning' };
    }
    case 'unavailable':
      return { title: m.voice.prompt.done, message: unavailableText(state.reason, ctx), level: -1, tone: 'warning' };
    case 'cancelled':
      return { title: m.voice.prompt.done, message: m.voice.cancelled, level: -1, tone: 'info' };
  }
}

/** True for the states that end a request: the panel shows them for a moment, then hides. */
export function endsRequest(state: VoiceState, busy: boolean): boolean {
  return !busy && state.phase !== 'idle' && state.phase !== 'listening' && state.phase !== 'thinking';
}
