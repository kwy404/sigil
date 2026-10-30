import type { ChecklistItem } from '../session/types';

/**
 * The first run tutorial as a pure state machine. The screens render the
 * current step and send events; nothing here touches React, the session or
 * storage, so every rule is covered by unit tests.
 */

/** Raise when the tutorial changes enough that everyone should see it again. Version 1 was the first guided tour. */
export const TOUR_VERSION = 2;

export const TOUR_STEPS = [
  'welcome',
  'about',
  'camera',
  'microphone',
  'accessibility',
  'overlay',
  'notifications',
  'mediaAccess',
  'writeSettings',
  'practice-point',
  'practice-pinch',
  'practice-palm',
  'practice-knob',
  'practice-fist',
  'voice',
  'confirm',
  'done',
] as const;

export type TourStep = (typeof TOUR_STEPS)[number];

export const PERMISSION_STEPS = [
  'camera',
  'microphone',
  'accessibility',
  'overlay',
  'notifications',
  'mediaAccess',
  'writeSettings',
] as const;
export type PermissionStep = (typeof PERMISSION_STEPS)[number];

export const PRACTICE_STEPS = ['practice-point', 'practice-pinch', 'practice-palm', 'practice-knob', 'practice-fist'] as const;
export type PracticeStep = (typeof PRACTICE_STEPS)[number];

/** Steps the user can leave out and still use every main feature. */
export const OPTIONAL_STEPS: readonly TourStep[] = ['notifications', 'mediaAccess', 'writeSettings'];

/** Special accesses the session checklist does not carry; the screens read them from the Android module. */
export type SpecialStep = 'mediaAccess' | 'writeSettings';

/** The gesture keys that complete each practice step. */
export const PRACTICE_TARGETS: Readonly<Record<PracticeStep, readonly string[]>> = {
  'practice-point': ['point'],
  'practice-pinch': ['pinch'],
  'practice-palm': ['open_palm'],
  'practice-knob': ['pinch_circle_cw', 'pinch_circle_ccw'],
  'practice-fist': ['fist'],
};

/** The checklist item each permission step waits for; the special accesses have none. */
export const PERMISSION_ITEMS: Readonly<Record<PermissionStep, ChecklistItem | null>> = {
  camera: 'camera',
  microphone: 'microphone',
  accessibility: 'accessibility',
  overlay: 'overlay',
  notifications: 'notifications',
  mediaAccess: null,
  writeSettings: null,
};

/** Android special accesses; other platforms leave these steps out. */
const ANDROID_ONLY: readonly PermissionStep[] = ['accessibility', 'overlay', 'notifications', 'mediaAccess', 'writeSettings'];

export type StepStatus = 'done' | 'skipped';

export interface TourOptions {
  /** True where Sigil can ask for the Android special accesses. */
  androidAccess: boolean;
  /** The checklist when the tutorial opens. Granted items are not asked again. */
  checklist: Readonly<Record<ChecklistItem, boolean>>;
  /** The special accesses when the tutorial opens, where the phone can tell. Granted ones are not asked again. */
  special?: Partial<Record<SpecialStep, boolean | null>>;
  /** Opened again from Settings rather than on the first launch. */
  replay?: boolean;
}

export interface TourState {
  steps: readonly TourStep[];
  index: number;
  status: Readonly<Partial<Record<TourStep, StepStatus>>>;
  /** The current step just reached its goal; the screen shows it, then sends advance. */
  success: TourStep | null;
  /** The answer given in the confirmation practice. */
  answer: 'yes' | 'no' | null;
  finished: boolean;
  replay: boolean;
}

export type TourEvent =
  | { type: 'next' }
  | { type: 'back' }
  /** Leaves this step for later. */
  | { type: 'skip' }
  /** Leaves the rest of the tutorial for later and goes to the last page. */
  | { type: 'skipAll' }
  /** A gesture the session recognized. */
  | { type: 'gesture'; key: string }
  /** A fresh checklist from the session. */
  | { type: 'checklist'; checklist: Readonly<Record<ChecklistItem, boolean>> }
  /** A special access the phone reports as granted. */
  | { type: 'access'; step: SpecialStep }
  /** The voice practice showed a plan. */
  | { type: 'practiced' }
  /** The confirmation practice got an answer by touch. */
  | { type: 'answer'; answer: 'yes' | 'no' }
  /** Moves on after a success was shown. */
  | { type: 'advance' }
  | { type: 'finish' };

export function isPermissionStep(step: TourStep): step is PermissionStep {
  return (PERMISSION_STEPS as readonly string[]).includes(step);
}

export function isPracticeStep(step: TourStep): step is PracticeStep {
  return (PRACTICE_STEPS as readonly string[]).includes(step);
}

/** The pages of one run, in order. */
export function buildSteps(options: TourOptions): TourStep[] {
  return TOUR_STEPS.filter((step) => {
    if (!isPermissionStep(step)) return true;
    if (!options.androidAccess && ANDROID_ONLY.includes(step)) return false;
    const item = PERMISSION_ITEMS[step];
    if (item === null) return options.special?.[step as SpecialStep] !== true;
    return !options.checklist[item];
  });
}

export function startTour(options: TourOptions): TourState {
  return {
    steps: buildSteps(options),
    index: 0,
    status: {},
    success: null,
    answer: null,
    finished: false,
    replay: options.replay === true,
  };
}

export function currentStep(state: TourState): TourStep {
  return state.steps[state.index];
}

export function progress(state: TourState): { index: number; total: number; fraction: number } {
  const total = state.steps.length;
  return { index: state.index, total, fraction: total > 1 ? state.index / (total - 1) : 1 };
}

/** Steps that ask for something and were left out, for the last page. */
export function leftForLater(state: TourState): TourStep[] {
  return state.steps.filter((step) => state.status[step] === 'skipped' && step !== 'welcome' && step !== 'about');
}

function mark(state: TourState, step: TourStep, value: StepStatus): TourState {
  if (state.status[step] === 'done') {
    return state;
  }
  return { ...state, status: { ...state.status, [step]: value } };
}

function moveTo(state: TourState, index: number): TourState {
  const clamped = Math.max(0, Math.min(state.steps.length - 1, index));
  return { ...state, index: clamped, success: null, answer: clamped === state.index ? state.answer : null };
}

/** What moving on means for a step nobody completed. */
function leave(state: TourState, step: TourStep): TourState {
  if (step === 'welcome' || step === 'about' || step === 'done') {
    return mark(state, step, 'done');
  }
  return mark(state, step, 'skipped');
}

function succeed(state: TourState, step: TourStep): TourState {
  const marked = { ...state, status: { ...state.status, [step]: 'done' as const } };
  return currentStep(state) === step ? { ...marked, success: step } : marked;
}

/**
 * A permission the phone reports as granted. Its page is celebrated when it is
 * open, recorded when it was already passed, and left out when it is still
 * ahead: the session checklist arrives a moment after the tour opens, and a
 * page that could only say "Allowed" is not worth a stop.
 */
function grant(state: TourState, step: TourStep): TourState {
  const at = state.steps.indexOf(step);
  if (at < 0 || state.status[step] === 'done') {
    return state;
  }
  if (at > state.index) {
    return { ...state, steps: state.steps.filter((candidate) => candidate !== step) };
  }
  return succeed(state, step);
}

export function tourReducer(state: TourState, event: TourEvent): TourState {
  if (state.finished) {
    return state;
  }
  const step = currentStep(state);
  switch (event.type) {
    case 'next':
      return moveTo(leave(state, step), state.index + 1);
    case 'back':
      return moveTo(state, state.index - 1);
    case 'skip':
      return step === 'done' ? tourReducer(state, { type: 'finish' }) : moveTo(mark(state, step, 'skipped'), state.index + 1);
    case 'skipAll': {
      let next = state;
      for (let i = state.index; i < state.steps.length - 1; i++) {
        next = leave(next, state.steps[i]);
      }
      return moveTo(next, state.steps.length - 1);
    }
    case 'gesture': {
      if (isPracticeStep(step) && PRACTICE_TARGETS[step].includes(event.key) && state.success !== step) {
        return succeed(state, step);
      }
      if (step === 'confirm' && state.answer === null && (event.key === 'pinch' || event.key === 'fist')) {
        return { ...succeed(state, step), answer: event.key === 'pinch' ? 'yes' : 'no' };
      }
      return state;
    }
    case 'answer':
      if (step === 'confirm' && state.answer === null) {
        return { ...succeed(state, step), answer: event.answer };
      }
      return state;
    case 'checklist': {
      let next = state;
      for (const candidate of state.steps) {
        if (!isPermissionStep(candidate)) continue;
        const item = PERMISSION_ITEMS[candidate];
        if (item !== null && event.checklist[item]) {
          next = grant(next, candidate);
        }
      }
      return next;
    }
    case 'access':
      return grant(state, event.step);
    case 'practiced':
      return step === 'voice' && state.success !== step ? succeed(state, step) : state;
    case 'advance':
      return state.success === step ? moveTo(state, state.index + 1) : state;
    case 'finish':
      return { ...mark(state, 'done', 'done'), index: state.steps.length - 1, success: null, finished: true };
  }
}

/** What the app saves when the tutorial ends, and whether it shows again. */
export interface TourRecord {
  version: number;
  completedAt: number;
  skipped: TourStep[];
}

export function completionRecord(state: TourState, now: number): TourRecord {
  return { version: TOUR_VERSION, completedAt: now, skipped: leftForLater(state) };
}

export function needsTour(saved: TourRecord | null | undefined): boolean {
  return !saved || typeof saved.version !== 'number' || saved.version < TOUR_VERSION;
}

/** Reads a saved record, tolerating old or broken files. */
export function parseTourRecord(value: unknown): TourRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<TourRecord>;
  if (typeof record.version !== 'number' || typeof record.completedAt !== 'number') return null;
  const skipped = Array.isArray(record.skipped)
    ? record.skipped.filter((step): step is TourStep => (TOUR_STEPS as readonly string[]).includes(step))
    : [];
  return { version: record.version, completedAt: record.completedAt, skipped };
}
