import { describe, expect, it } from '@jest/globals';

import {
  ListenAbortedError,
  SpeechUnavailableError,
  UnclearSpeechError,
  type ListenOptions,
  type SpeechToText,
  type Transcript,
} from '../../adapters/voice/speech-to-text';
import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner, type ConfirmationRequest, type ExecutionResult, type InstalledApp, type Plan } from '../../sigil-core';
import { VoiceSession, type VoiceRunner, type VoiceState } from '../session';

const profiles = ProfileRegistry.withBuiltins();
const PHONE: InstalledApp[] = [
  { label: 'Instagram', packageName: 'com.instagram.android' },
  { label: 'Instagram Lite', packageName: 'com.instagram.lite' },
  { label: 'YouTube', packageName: 'com.google.android.youtube' },
  { label: 'WhatsApp', packageName: 'com.whatsapp' },
];

type Heard = Transcript | Error | 'silence';

function said(text: string, confidence: number | null = 0.9, alternatives: Transcript['alternatives'] = []): Transcript {
  return { text, locale: 'en-US', confidence, alternatives, durationMs: 900, engine: 'fake' };
}

/** Speech that answers each listen with the next scripted item; silence waits until cancelled. */
class FakeSpeech implements SpeechToText {
  readonly id = 'fake';
  readonly onDevice = true;
  listens: ListenOptions[] = [];

  constructor(private readonly script: Heard[]) {}

  async isAvailable(): Promise<boolean> {
    return true;
  }

  listen(options: ListenOptions): Promise<Transcript> {
    this.listens.push(options);
    const next = this.script.shift() ?? 'silence';
    if (next === 'silence') {
      return new Promise((_, reject) => {
        options.signal?.addEventListener('abort', () => reject(new ListenAbortedError()));
      });
    }
    options.onLevel?.(0.6, false);
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
}

/** Runs a plan by asking every confirm step; a refused confirmation cancels, as the executor does. */
class FakeRunner implements VoiceRunner {
  plans: Plan[] = [];
  answers: boolean[] = [];

  async run(plan: Plan, confirm: (request: ConfirmationRequest) => Promise<boolean>): Promise<ExecutionResult> {
    this.plans.push(plan);
    for (let index = 0; index < plan.steps.length; index++) {
      const step = plan.steps[index];
      if (step.kind !== 'confirm') continue;
      const yes = await confirm({ summary: step.summary, reason: step.reason, plan });
      this.answers.push(yes);
      if (!yes) return { status: 'cancelled', completedSteps: index };
    }
    return { status: 'completed', completedSteps: plan.steps.length };
  }
}

function session(script: Heard[], options: { foreground?: string | null } = {}) {
  const speech = new FakeSpeech(script);
  const runner = new FakeRunner();
  const planner = new ActionPlanner({ profiles, installedApps: () => PHONE });
  const voice = new VoiceSession({
    speech,
    planner,
    runner,
    locale: () => 'en-US',
    foreground: () => options.foreground ?? null,
    answerSeconds: 0.05,
    repeatPauseMs: 1,
  });
  const states: VoiceState[] = [];
  voice.subscribe((state) => states.push(state));
  return { voice, speech, runner, states };
}

function phases(states: VoiceState[]): string[] {
  return states.map((state) => state.phase).filter((phase, i, all) => phase !== all[i - 1]);
}

const MESSAGE = said('send a message to Ana on WhatsApp saying on my way');

describe('VoiceSession', () => {
  it('carries out a clear request', async () => {
    const { voice, runner, states } = session([said('open YouTube')]);
    await voice.start();
    expect(runner.plans).toHaveLength(1);
    expect(runner.plans[0].steps[0]).toMatchObject({ kind: 'open_app', packageName: 'com.google.android.youtube' });
    expect(phases(states)).toEqual(['listening', 'thinking', 'running', 'done']);
    expect(voice.current).toMatchObject({ phase: 'done', result: { status: 'completed' } });
    expect(voice.busy).toBe(false);
  });

  it('never acts on unclear audio and asks to repeat', async () => {
    const { voice, speech, runner, states } = session([
      new UnclearSpeechError('too_quiet', true),
      new UnclearSpeechError('clipped', false),
    ]);
    await voice.start();
    expect(runner.plans).toHaveLength(0);
    expect(speech.listens).toHaveLength(2);
    expect(states).toContainEqual(expect.objectContaining({ phase: 'listening', retry: 'too_quiet' }));
    expect(voice.current).toEqual({ phase: 'repeat', reason: 'clipped', noisy: false });
  });

  it('asks to repeat when the recognizer is unsure, and acts on the second clear try', async () => {
    const { voice, runner } = session([said('open YouTube', 0.2), said('open YouTube', 0.95)]);
    await voice.start();
    expect(runner.plans).toHaveLength(1);
  });

  it('tries the alternatives before asking again, and never one the recognizer doubts', async () => {
    const helped = session([said('opem yu tube', 0.8, [{ text: 'open YouTube', confidence: 0.6 }])]);
    await helped.voice.start();
    expect(helped.runner.plans).toHaveLength(1);
    expect(helped.voice.current).toMatchObject({ phase: 'done', heard: 'open YouTube' });

    const doubtful = session([said('opem yu tube', 0.8, [{ text: 'open YouTube', confidence: 0.1 }]), said('blah blah', 0.9)]);
    await doubtful.voice.start();
    expect(doubtful.runner.plans).toHaveLength(0);
    expect(doubtful.voice.current).toMatchObject({ phase: 'repeat', reason: 'not_understood' });
  });

  it('confirms a send only on an explicit spoken yes', async () => {
    const yes = session([MESSAGE, said('yes')]);
    await yes.voice.start();
    expect(yes.runner.answers).toEqual([true]);

    const no = session([MESSAGE, said('no, cancel')]);
    await no.voice.start();
    expect(no.runner.answers).toEqual([false]);

    const unclear = session([MESSAGE, said('maybe later')]);
    await unclear.voice.start();
    expect(unclear.runner.answers).toEqual([false]);
  });

  it('cancels after silence', async () => {
    const quiet = session([MESSAGE, new UnclearSpeechError('no_speech', false)]);
    await quiet.voice.start();
    expect(quiet.runner.answers).toEqual([false]);

    const timeout = session([MESSAGE, 'silence']);
    await timeout.voice.start();
    expect(timeout.runner.answers).toEqual([false]);
  });

  it('takes a pinch as yes and a fist as no while a question is open', async () => {
    const pinch = session([MESSAGE, 'silence']);
    pinch.voice.subscribe((state) => {
      if (state.phase === 'confirm') expect(pinch.voice.gesture('pinch')).toBe(true);
    });
    await pinch.voice.start();
    expect(pinch.runner.answers).toEqual([true]);

    const fist = session([MESSAGE, 'silence']);
    fist.voice.subscribe((state) => {
      if (state.phase === 'confirm') expect(fist.voice.gesture('fist')).toBe(true);
    });
    await fist.voice.start();
    expect(fist.runner.answers).toEqual([false]);
    expect(fist.voice.gesture('pinch')).toBe(false);
  });

  it('asks which app when two builds are installed and follows the spoken pick', async () => {
    const { voice, runner, states } = session([said('open insta'), said('the lite one')]);
    await voice.start();
    expect(states).toContainEqual(expect.objectContaining({ phase: 'choose' }));
    expect(runner.plans[0].steps[0]).toMatchObject({ packageName: 'com.instagram.lite' });
  });

  it('lets the screen pick or a fist cancel the choice', async () => {
    const picked = session([said('open insta'), 'silence']);
    picked.voice.subscribe((state) => {
      if (state.phase === 'choose') picked.voice.pick(state.outcome.options[0]);
    });
    await picked.voice.start();
    expect(picked.runner.plans[0].steps[0]).toMatchObject({ packageName: 'com.instagram.android' });

    const cancelled = session([said('open insta'), 'silence']);
    cancelled.voice.subscribe((state) => {
      if (state.phase === 'choose') cancelled.voice.gesture('fist');
    });
    await cancelled.voice.start();
    expect(cancelled.runner.plans).toHaveLength(0);
    expect(cancelled.voice.current.phase).toBe('cancelled');
  });

  it('says honestly when listening is not possible', async () => {
    const { voice, runner } = session([new SpeechUnavailableError('on_device_unavailable')]);
    await voice.start();
    expect(voice.current).toEqual({ phase: 'unavailable', reason: 'on_device_unavailable' });
    expect(runner.plans).toHaveLength(0);
  });

  it('stops listening on a fist without acting', async () => {
    const { voice, runner } = session(['silence']);
    const done = voice.start();
    expect(voice.gesture('fist')).toBe(true);
    await done;
    expect(voice.current.phase).toBe('cancelled');
    expect(runner.plans).toHaveLength(0);
  });

  it('runs a typed request the same way, with the same confirmation', async () => {
    const { voice, speech, runner } = session([said('yes')]);
    await voice.startTyped('send a message to Ana on WhatsApp saying on my way');
    expect(runner.answers).toEqual([true]);
    expect(speech.listens).toHaveLength(1);
  });

  it('shows plans it will not run without running them', async () => {
    const { voice, runner } = session([said('send happy new year to all my contacts')]);
    await voice.start();
    expect(runner.plans).toHaveLength(0);
    expect(voice.current).toMatchObject({ phase: 'done', outcome: { status: 'blocked' }, result: null });
  });
});
