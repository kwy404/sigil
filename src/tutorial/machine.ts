import type { GestureKind } from '../gesture-engine/gestures';
import type { SavedTutorial } from '../settings/store';

/** Raise when the tutorial changes enough that everyone should see it again. */
export const TUTORIAL_VERSION = 1;

/** Every step, in order. Platforms without a feature leave its steps out (see stepsFor). */
export const TUTORIAL_STEPS = [
  'welcome',
  'camera',
  'microphone',
  'accessibility',
  'overlay',
  'media_access',
  'write_settings',
  'practice_point',
  'practice_pinch',
  'practice_palm',
  'practice_knob',
  'practice_fist',
  'voice',
  'confirm',
  'profiles',
  'done',
] as const;

export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/** Permission and special access steps. Only Android asks for them. */
export const ACCESS_STEPS = ['camera', 'microphone', 'accessibility', 'overlay', 'media_access', 'write_settings'] as const;

export type AccessStep = (typeof ACCESS_STEPS)[number];

/** Access steps the user can leave out and still use the main features. */
export const OPTIONAL_STEPS: readonly TutorialStep[] = ['media_access', 'write_settings'];

/** The gestures each practice step waits for. */
export const PRACTICE_GESTURES: Partial<Record<TutorialStep, readonly GestureKind[]>> = {
  practice_point: ['point'],
  practice_pinch: ['pinch'],
  practice_palm: ['open_palm'],
  practice_knob: ['pinch_circle_cw', 'pinch_circle_ccw'],
  practice_fist: ['fist'],
};

export type TutorialPlatform = 'android' | 'ios' | 'web';

export interface TutorialState {
  steps: readonly TutorialStep[];
  index: number;
  /** True once the user finished or skipped the tutorial. A replay keeps it true. */
  completed: boolean;
  /** Steps left for later, so the last step can list them. */
  skipped: readonly TutorialStep[];
  /** Steps whose goal was reached: an access granted, a gesture made, a practice done. */
  reached: readonly TutorialStep[];
  /** Started from settings or by voice instead of on the first launch. */
  replay: boolean;
  /** The user finished or left the tutorial; the screen goes to the main screen. */
  closed: boolean;
}

export type TutorialEvent =
  | { type: 'next' }
  | { type: 'back' }
  /** Leaves this step for later. */
  | { type: 'skip' }
  /** Leaves the whole tutorial. It counts as seen and does not come back on its own. */
  | { type: 'skip_all' }
  | { type: 'finish' }
  | { type: 'restart' }
  /** An access was granted, here or earlier in the system settings. */
  | { type: 'granted'; step: AccessStep }
  /** A live gesture. onTarget is false when a pinch landed outside the practice target. */
  | { type: 'gesture'; gesture: GestureKind; onTarget?: boolean }
  /** The voice dry run showed a plan, or the confirmation practice got an answer. */
  | { type: 'practiced' };

export function stepsFor(platform: TutorialPlatform): readonly TutorialStep[] {
  if (platform === 'android') {
    return TUTORIAL_STEPS;
  }
  return TUTORIAL_STEPS.filter((step) => !(ACCESS_STEPS as readonly string[]).includes(step));
}

/** True on the first launch, after the tutorial was left halfway, and when a newer tutorial exists. */
export function needsTutorial(saved: SavedTutorial | undefined): boolean {
  return !saved || !saved.completed || saved.version < TUTORIAL_VERSION;
}

/**
 * The state to open the tutorial with. A first run resumes where an earlier
 * run of the same version was left; a replay always starts from the top.
 */
export function startTutorial(
  saved: SavedTutorial | undefined,
  platform: TutorialPlatform,
  options: { replay?: boolean } = {},
): TutorialState {
  const steps = stepsFor(platform);
  const sameVersion = saved?.version === TUTORIAL_VERSION;
  const resumeAt = !options.replay && sameVersion && !saved?.completed && saved?.step ? steps.indexOf(saved.step as TutorialStep) : -1;
  return {
    steps,
    index: Math.max(0, resumeAt),
    completed: sameVersion && saved?.completed === true,
    skipped: [],
    reached: [],
    replay: options.replay === true,
    closed: false,
  };
}

export function currentStep(state: TutorialState): TutorialStep {
  return state.steps[state.index];
}

export function tutorialProgress(state: TutorialState): { index: number; total: number } {
  return { index: state.index, total: state.steps.length };
}

function advance(state: TutorialState): TutorialState {
  if (state.index >= state.steps.length - 1) {
    return { ...state, completed: true, closed: true };
  }
  return { ...state, index: state.index + 1 };
}

function reach(state: TutorialState, step: TutorialStep): TutorialState {
  return state.reached.includes(step) ? state : { ...state, reached: [...state.reached, step] };
}

export function tutorialReducer(state: TutorialState, event: TutorialEvent): TutorialState {
  if (state.closed && event.type !== 'restart') {
    return state;
  }
  const step = currentStep(state);
  switch (event.type) {
    case 'next':
      return advance(state);
    case 'back':
      return state.index === 0 ? state : { ...state, index: state.index - 1 };
    case 'skip':
      return advance(step === 'done' || state.skipped.includes(step) ? state : { ...state, skipped: [...state.skipped, step] });
    case 'skip_all':
    case 'finish':
      return { ...state, completed: true, closed: true };
    case 'restart':
      return { ...state, index: 0, skipped: [], reached: [], replay: true, closed: false };
    case 'granted': {
      const granted = reach(state, event.step);
      return step === event.step ? advance(granted) : granted;
    }
    case 'gesture': {
      const expected = PRACTICE_GESTURES[step];
      if (!expected?.includes(event.gesture) || (step === 'practice_pinch' && event.onTarget === false)) {
        return state;
      }
      return advance(reach(state, step));
    }
    case 'practiced':
      return step === 'voice' || step === 'confirm' ? reach(state, step) : state;
  }
}

/** What to remember: the step to resume at, or that the tutorial was seen. */
export function toSaved(state: TutorialState): SavedTutorial {
  if (state.closed || state.completed) {
    return { version: TUTORIAL_VERSION, completed: true };
  }
  return { version: TUTORIAL_VERSION, completed: false, step: currentStep(state) };
}
