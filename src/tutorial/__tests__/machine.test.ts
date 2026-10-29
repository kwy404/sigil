import { describe, expect, it } from '@jest/globals';

import {
  currentStep,
  needsTutorial,
  startTutorial,
  stepsFor,
  toSaved,
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
  tutorialProgress,
  tutorialReducer,
  type TutorialEvent,
  type TutorialState,
  type TutorialStep,
} from '../machine';

function run(state: TutorialState, ...events: TutorialEvent[]): TutorialState {
  return events.reduce(tutorialReducer, state);
}

function at(step: TutorialStep, platform: 'android' | 'ios' = 'android'): TutorialState {
  const state = startTutorial(undefined, platform);
  return { ...state, index: state.steps.indexOf(step) };
}

describe('first run', () => {
  it('shows the tutorial until it is finished, and again for a newer version', () => {
    expect(needsTutorial(undefined)).toBe(true);
    expect(needsTutorial({ version: TUTORIAL_VERSION, completed: false, step: 'voice' })).toBe(true);
    expect(needsTutorial({ version: TUTORIAL_VERSION, completed: true })).toBe(false);
    expect(needsTutorial({ version: TUTORIAL_VERSION - 1, completed: true })).toBe(true);
  });

  it('starts with the welcome and counts every step', () => {
    const state = startTutorial(undefined, 'android');
    expect(currentStep(state)).toBe('welcome');
    expect(tutorialProgress(state)).toEqual({ index: 0, total: TUTORIAL_STEPS.length });
    expect(state.completed).toBe(false);
  });

  it('leaves the Android access steps out on iOS', () => {
    expect(stepsFor('ios')).toEqual([
      'welcome',
      'practice_point',
      'practice_pinch',
      'practice_palm',
      'practice_knob',
      'practice_fist',
      'voice',
      'confirm',
      'profiles',
      'done',
    ]);
  });

  it('walks forward and back, and finishes on the last step', () => {
    let state = run(startTutorial(undefined, 'android'), { type: 'back' });
    expect(state.index).toBe(0);
    state = run(state, { type: 'next' }, { type: 'next' }, { type: 'back' });
    expect(currentStep(state)).toBe('camera');
    state = run(at('done'), { type: 'next' });
    expect(state).toMatchObject({ completed: true, closed: true });
    expect(toSaved(state)).toEqual({ version: TUTORIAL_VERSION, completed: true });
  });
});

describe('resume', () => {
  it('resumes where a run of the same version was left', () => {
    const state = startTutorial({ version: TUTORIAL_VERSION, completed: false, step: 'voice' }, 'android');
    expect(currentStep(state)).toBe('voice');
    expect(toSaved(state)).toEqual({ version: TUTORIAL_VERSION, completed: false, step: 'voice' });
  });

  it('starts over for an older version or a step this platform does not have', () => {
    expect(currentStep(startTutorial({ version: TUTORIAL_VERSION - 1, completed: false, step: 'voice' }, 'android'))).toBe('welcome');
    expect(currentStep(startTutorial({ version: TUTORIAL_VERSION, completed: false, step: 'overlay' }, 'ios'))).toBe('welcome');
  });
});

describe('skip', () => {
  it('leaves one step for later and remembers it', () => {
    const state = run(at('media_access'), { type: 'skip' });
    expect(currentStep(state)).toBe('write_settings');
    expect(state.skipped).toEqual(['media_access']);
  });

  it('leaves the whole tutorial as seen', () => {
    const state = run(at('camera'), { type: 'skip_all' });
    expect(state).toMatchObject({ completed: true, closed: true });
    expect(needsTutorial(toSaved(state))).toBe(false);
    expect(run(state, { type: 'next' })).toBe(state);
  });
});

describe('practice', () => {
  it('moves on when the expected gesture arrives', () => {
    expect(currentStep(run(at('practice_point'), { type: 'gesture', gesture: 'point' }))).toBe('practice_pinch');
    expect(currentStep(run(at('practice_knob'), { type: 'gesture', gesture: 'pinch_circle_ccw' }))).toBe('practice_fist');
    expect(currentStep(run(at('practice_fist'), { type: 'gesture', gesture: 'fist' }))).toBe('voice');
  });

  it('ignores other gestures and a pinch beside the target', () => {
    expect(currentStep(run(at('practice_point'), { type: 'gesture', gesture: 'fist' }))).toBe('practice_point');
    expect(currentStep(run(at('practice_pinch'), { type: 'gesture', gesture: 'pinch', onTarget: false }))).toBe('practice_pinch');
    const state = run(at('practice_pinch'), { type: 'gesture', gesture: 'pinch', onTarget: true });
    expect(currentStep(state)).toBe('practice_palm');
    expect(state.reached).toEqual(['practice_pinch']);
  });

  it('marks the voice and confirmation practice without leaving the step', () => {
    const state = run(at('voice'), { type: 'practiced' });
    expect(currentStep(state)).toBe('voice');
    expect(state.reached).toEqual(['voice']);
  });

  it('moves on when the access of the current step is granted', () => {
    expect(currentStep(run(at('accessibility'), { type: 'granted', step: 'accessibility' }))).toBe('overlay');
    const early = run(at('camera'), { type: 'granted', step: 'overlay' });
    expect(currentStep(early)).toBe('camera');
    expect(early.reached).toEqual(['overlay']);
  });
});

describe('redo', () => {
  it('starts a replay from the top and keeps the tutorial as seen', () => {
    const replay = startTutorial({ version: TUTORIAL_VERSION, completed: true }, 'android', { replay: true });
    expect(replay).toMatchObject({ index: 0, completed: true, replay: true });
    const left = run(replay, { type: 'next' }, { type: 'next' });
    expect(needsTutorial(toSaved(left))).toBe(false);
  });

  it('restarts from the last step', () => {
    const finished = run(at('done'), { type: 'finish' });
    const again = run(finished, { type: 'restart' });
    expect(again).toMatchObject({ index: 0, closed: false, completed: true, skipped: [], reached: [] });
  });
});
