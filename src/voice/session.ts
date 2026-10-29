import {
  ListenAbortedError,
  SpeechUnavailableError,
  UnclearSpeechError,
  type SpeechToText,
  type Transcript,
  type UnavailableReason,
  type UnclearReason,
} from '../adapters/voice';
import { pickApp } from '../sigil-core/apps';
import { parseAnswer } from '../sigil-core/answers';
import type { ConfirmationRequest, ExecutionResult, StepEvent } from '../sigil-core/executor';
import type { AppChoice } from '../sigil-core/notices';
import type { Plan, PlanOutcome, VoiceRequest } from '../sigil-core/planner';

/** A transcript below this confidence is not trusted: Sigil asks to repeat instead of acting. */
export const LOW_CONFIDENCE = 0.4;
/** Seconds a question waits for an answer; silence cancels. */
export const ANSWER_SECONDS = 8;
/** Times Sigil listens for one request before it stops asking to repeat. */
export const MAX_ATTEMPTS = 2;

export type ChooseOutcome = Extract<PlanOutcome, { status: 'choose' }>;

/** Why Sigil asks to repeat: the audio was unclear, the recognizer was unsure, or the words made no request. */
export type RepeatReason = UnclearReason | 'low_confidence' | 'not_understood';

export type ListenPurpose = 'request' | 'answer' | 'choice';

export type VoiceState =
  | { phase: 'idle' }
  | {
      phase: 'listening';
      purpose: ListenPurpose;
      level: number;
      noisy: boolean;
      partial: string | null;
      /** Set on a second attempt, with why the first one was not used. */
      retry: RepeatReason | null;
    }
  | { phase: 'thinking'; heard: string }
  | { phase: 'repeat'; reason: RepeatReason; noisy: boolean }
  | { phase: 'choose'; heard: string; outcome: ChooseOutcome; secondsLeft: number; level: number }
  | { phase: 'confirm'; heard: string; plan: Plan; index: number; secondsLeft: number; level: number; unsure: boolean }
  | { phase: 'running'; heard: string; plan: Plan; events: StepEvent[] }
  | { phase: 'done'; heard: string; outcome: PlanOutcome; result: ExecutionResult | null }
  | { phase: 'unavailable'; reason: UnavailableReason }
  | { phase: 'cancelled' };

export interface VoicePlanner {
  plan(request: VoiceRequest): Promise<PlanOutcome>;
  planChoice(outcome: ChooseOutcome, choice: AppChoice): PlanOutcome;
}

export interface VoiceRunner {
  run(
    plan: Plan,
    confirm: (request: ConfirmationRequest) => Promise<boolean>,
    onStep: (event: StepEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionResult>;
}

export interface VoiceSessionOptions {
  speech: SpeechToText;
  planner: VoicePlanner;
  runner: VoiceRunner;
  /** BCP 47 locale of the app language, read for every request. */
  locale: () => string;
  /** The app in front, or null. */
  foreground: () => string | null;
  answerSeconds?: number;
  /** Pause between "please repeat" and listening again, in milliseconds. */
  repeatPauseMs?: number;
}

type Heard = { transcript: Transcript } | { unclear: UnclearReason; noisy: boolean } | null;

/**
 * One spoken request from listening to the end: the speech is checked (the
 * voice gate, the recognizer's confidence and its alternatives) before
 * anything is planned, a name that fits several apps is asked about, and every
 * confirmation waits for an explicit yes: by voice, with a pinch or on
 * screen. A fist or eight seconds of silence cancel. The in app screen and the
 * panel over other apps render the same states.
 */
export class VoiceSession {
  private state: VoiceState = { phase: 'idle' };
  private readonly listeners = new Set<(state: VoiceState) => void>();
  private abort: AbortController | null = null;
  /** Ends the question on screen: a confirmation (true or false) or a choice (an app or null). */
  private settleQuestion: ((answer: boolean | AppChoice | null) => void) | null = null;

  constructor(private readonly options: VoiceSessionOptions) {}

  get current(): VoiceState {
    return this.state;
  }

  /** True from the start of listening until the request ends. */
  get busy(): boolean {
    return this.abort !== null;
  }

  subscribe(listener: (state: VoiceState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Listens for a request and carries it out. Does nothing while a request is in progress. */
  async start(): Promise<void> {
    if (this.busy) return;
    const controller = this.begin();
    try {
      let retry: RepeatReason | null = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const heard = await this.listen('request', controller.signal, retry);
        if (!heard) return;
        const understood = 'transcript' in heard ? await this.understand(heard.transcript) : null;
        if (understood && !('repeat' in understood)) {
          await this.handle(understood.outcome, understood.heard, understood.unsure, controller.signal);
          return;
        }
        retry = understood ? understood.repeat : 'unclear' in heard ? heard.unclear : 'no_match';
        const noisy = 'noisy' in heard ? heard.noisy : (heard.transcript.noisy ?? false);
        this.set({ phase: 'repeat', reason: retry, noisy });
        if (attempt < MAX_ATTEMPTS) await this.pause(this.options.repeatPauseMs ?? 900, controller.signal);
      }
    } finally {
      this.end(controller);
    }
  }

  /** Carries out a typed request: the same plan, questions and confirmations, without listening first. */
  async startTyped(text: string): Promise<void> {
    if (this.busy || !text.trim()) return;
    const controller = this.begin();
    try {
      this.set({ phase: 'thinking', heard: text });
      const outcome = await this.options.planner.plan(this.request(text));
      await this.handle(outcome, text, false, controller.signal);
    } finally {
      this.end(controller);
    }
  }

  cancel(): void {
    if (!this.abort) return;
    this.settleQuestion?.(null);
    this.abort.abort();
    this.set({ phase: 'cancelled' });
  }

  /** The answer to a confirmation, from the screen. */
  answer(yes: boolean): void {
    if (this.state.phase === 'confirm') this.settleQuestion?.(yes);
  }

  /** The app picked from the options, from the screen; null cancels. */
  pick(choice: AppChoice | null): void {
    if (this.state.phase === 'choose') this.settleQuestion?.(choice);
  }

  /**
   * A pinch or a fist while a request is in progress. A pinch confirms, a fist
   * cancels a question or stops listening. Returns true when the gesture was
   * used here and must not act on the app in front.
   */
  gesture(kind: 'pinch' | 'fist'): boolean {
    switch (this.state.phase) {
      case 'confirm':
        this.settleQuestion?.(kind === 'pinch');
        return true;
      case 'choose':
        if (kind === 'fist') {
          this.settleQuestion?.(null);
          return true;
        }
        return false;
      case 'listening':
      case 'thinking':
        if (kind === 'fist') {
          this.cancel();
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  private begin(): AbortController {
    const controller = new AbortController();
    this.abort = controller;
    return controller;
  }

  private end(controller: AbortController): void {
    if (this.abort === controller) this.abort = null;
    this.settleQuestion = null;
    // Tell the screens the request is over, so busy reads false.
    this.set({ ...this.state });
  }

  private set(state: VoiceState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  private request(text: string): VoiceRequest {
    return { text, locale: this.options.locale(), foregroundPackage: this.options.foreground() };
  }

  private pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Listens once. Null when listening was cancelled or is not possible (the state says which). */
  private async listen(purpose: ListenPurpose, signal: AbortSignal, retry: RepeatReason | null = null): Promise<Heard> {
    if (purpose === 'request') {
      this.set({ phase: 'listening', purpose, level: 0, noisy: false, partial: null, retry });
    }
    try {
      const transcript = await this.options.speech.listen({
        locale: this.options.locale(),
        signal,
        noSpeechMs: purpose === 'request' ? undefined : (this.options.answerSeconds ?? ANSWER_SECONDS) * 1000,
        onPartial: (partial) => {
          if (this.state.phase === 'listening') this.set({ ...this.state, partial });
        },
        onLevel: (level, noisy) => {
          const state = this.state;
          if (state.phase === 'listening') this.set({ ...state, level, noisy });
          if (state.phase === 'confirm' || state.phase === 'choose') this.set({ ...state, level });
        },
      });
      return { transcript };
    } catch (error) {
      if (error instanceof UnclearSpeechError) {
        return { unclear: error.reason, noisy: error.noisy };
      }
      if (error instanceof ListenAbortedError || signal.aborted) {
        return null;
      }
      if (purpose === 'request') {
        this.set({ phase: 'unavailable', reason: error instanceof SpeechUnavailableError ? error.reason : 'other' });
      }
      return null;
    }
  }

  /** The plan for a transcript, or why to ask again. Unsure transcripts and unknown words are never acted on. */
  private async understand(
    transcript: Transcript,
  ): Promise<{ outcome: PlanOutcome; heard: string; unsure: boolean } | { repeat: RepeatReason }> {
    if (transcript.confidence !== null && transcript.confidence < LOW_CONFIDENCE) {
      return { repeat: 'low_confidence' };
    }
    this.set({ phase: 'thinking', heard: transcript.text });
    const outcome = await this.options.planner.plan(this.request(transcript.text));
    if (outcome.status !== 'not_understood') {
      return { outcome, heard: transcript.text, unsure: transcript.confidence === null };
    }
    for (const alternative of transcript.alternatives ?? []) {
      if (alternative.confidence === null || alternative.confidence < LOW_CONFIDENCE) continue;
      const next = await this.options.planner.plan(this.request(alternative.text));
      if (next.status !== 'not_understood') {
        return { outcome: next, heard: alternative.text, unsure: true };
      }
    }
    return { repeat: 'not_understood' };
  }

  private async handle(outcome: PlanOutcome, heard: string, unsure: boolean, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    if (outcome.status === 'choose') {
      const choice = await this.ask(signal, (secondsLeft) => ({ phase: 'choose', heard, outcome, secondsLeft, level: 0 }), 'choice', (text) =>
        pickApp(text, outcome.options),
      );
      if (!choice || typeof choice === 'boolean' || signal.aborted) {
        if (!signal.aborted) this.set({ phase: 'cancelled' });
        return;
      }
      await this.handle(this.options.planner.planChoice(outcome, choice), heard, unsure, signal);
      return;
    }
    if (outcome.status !== 'planned') {
      this.set({ phase: 'done', heard, outcome, result: null });
      return;
    }
    const { plan } = outcome;
    let events: StepEvent[] = [];
    this.set({ phase: 'running', heard, plan, events });
    const confirm = async (request: ConfirmationRequest): Promise<boolean> => {
      const index = plan.steps.findIndex((step) => step.kind === 'confirm' && step.summary === request.summary);
      const answer = await this.ask(
        signal,
        (secondsLeft) => ({ phase: 'confirm', heard, plan, index, secondsLeft, level: 0, unsure }),
        'answer',
        (text) => parseAnswer(text) === 'yes',
      );
      if (!signal.aborted) this.set({ phase: 'running', heard, plan, events });
      // Only an explicit yes counts: silence, a fist, a no or an unclear answer cancel.
      return answer === true;
    };
    const result = await this.options.runner.run(
      plan,
      confirm,
      (event) => {
        events = [...events.filter((entry) => entry.index !== event.index), event];
        if (this.state.phase === 'running') this.set({ phase: 'running', heard, plan, events });
      },
      signal,
    );
    if (!signal.aborted) this.set({ phase: 'done', heard, outcome, result });
  }

  /**
   * Shows a question and waits for the first answer: the screen, a gesture or
   * the voice. Silence for the answer time, or a voice answer that is not
   * understood, gives null.
   */
  private ask<T extends boolean | AppChoice>(
    signal: AbortSignal,
    show: (secondsLeft: number) => VoiceState,
    purpose: ListenPurpose,
    read: (text: string) => T | null,
  ): Promise<T | AppChoice | boolean | null> {
    const seconds = this.options.answerSeconds ?? ANSWER_SECONDS;
    return new Promise((resolve) => {
      const voice = new AbortController();
      let tick: ReturnType<typeof setInterval> | undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let done = false;
      const stopVoice = () => voice.abort();
      const settle = (answer: T | AppChoice | boolean | null) => {
        if (done) return;
        done = true;
        if (this.settleQuestion === settle) this.settleQuestion = null;
        if (tick !== undefined) clearInterval(tick);
        if (timeout !== undefined) clearTimeout(timeout);
        signal.removeEventListener('abort', stopVoice);
        voice.abort();
        resolve(answer);
      };
      // Ready before the question shows, so an answer given at once is not lost.
      this.settleQuestion = settle;
      signal.addEventListener('abort', stopVoice);
      let left = seconds;
      this.set(show(left));
      if (done) return;
      tick = setInterval(() => {
        left = Math.max(0, left - 1);
        const state = this.state;
        if (state.phase === 'confirm' || state.phase === 'choose') this.set({ ...state, secondsLeft: left });
      }, 1000);
      timeout = setTimeout(() => settle(null), seconds * 1000);
      void this.listen(purpose, voice.signal).then((heard) => {
        if (heard && 'transcript' in heard) {
          settle(read(heard.transcript.text));
        } else if (heard) {
          // Silence or unclear audio: nothing is confirmed or picked.
          settle(null);
        }
      });
    });
  }
}
