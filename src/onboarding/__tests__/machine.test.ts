import { describe, expect, it } from '@jest/globals';

import type { ChecklistItem } from '../../session/types';
import {
  buildSteps,
  completionRecord,
  currentStep,
  leftForLater,
  needsTour,
  parseTourRecord,
  PRACTICE_STEPS,
  PRACTICE_TARGETS,
  progress,
  startTour,
  TOUR_STEPS,
  TOUR_VERSION,
  tourReducer,
  type TourEvent,
  type TourState,
  type TourStep,
} from '../machine';

const NOTHING: Record<ChecklistItem, boolean> = {
  accessibility: false,
  overlay: false,
  camera: false,
  microphone: false,
  notifications: false,
  restrictedSettings: false,
};

const EVERYTHING: Record<ChecklistItem, boolean> = {
  accessibility: true,
  overlay: true,
  camera: true,
  microphone: true,
  notifications: true,
  restrictedSettings: true,
};

function run(state: TourState, ...events: TourEvent[]): TourState {
  return events.reduce(tourReducer, state);
}

function goTo(state: TourState, step: TourStep): TourState {
  let next = state;
  for (let guard = 0; currentStep(next) !== step; guard++) {
    if (guard > TOUR_STEPS.length) throw new Error(`never reached ${step}`);
    next = tourReducer(next, { type: 'next' });
  }
  return next;
}

describe('steps of a run', () => {
  it('asks a fresh Android install for every permission, in order, before the practice', () => {
    expect(buildSteps({ androidAccess: true, checklist: NOTHING })).toEqual([...TOUR_STEPS]);
  });

  it('leaves out what is already granted, and keeps the special accesses the phone cannot report', () => {
    const steps = buildSteps({ androidAccess: true, checklist: EVERYTHING });
    expect(steps).not.toContain('camera');
    expect(steps).not.toContain('accessibility');
    expect(steps).toContain('mediaAccess');
    expect(steps).toContain('writeSettings');
  });

  it('leaves out a special access the phone reports as granted', () => {
    const steps = buildSteps({ androidAccess: true, checklist: EVERYTHING, special: { mediaAccess: true, writeSettings: null } });
    expect(steps).not.toContain('mediaAccess');
    expect(steps).toContain('writeSettings');
  });

  it('skips the Android special accesses where they do not exist', () => {
    const steps = buildSteps({ androidAccess: false, checklist: NOTHING });
    expect(steps).toContain('camera');
    expect(steps).toContain('microphone');
    for (const step of ['accessibility', 'overlay', 'notifications', 'mediaAccess', 'writeSettings'] as const) {
      expect(steps).not.toContain(step);
    }
  });

  it('always starts with the welcome and ends with done, with the five practices and both dry runs', () => {
    const steps = buildSteps({ androidAccess: false, checklist: EVERYTHING });
    expect(steps[0]).toBe('welcome');
    expect(steps[steps.length - 1]).toBe('done');
    for (const step of [...PRACTICE_STEPS, 'voice', 'confirm'] as const) {
      expect(steps).toContain(step);
    }
  });
});

describe('moving through the tutorial', () => {
  const start = () => startTour({ androidAccess: true, checklist: NOTHING });

  it('goes forward and back and never past either end', () => {
    let state = start();
    state = tourReducer(state, { type: 'back' });
    expect(state.index).toBe(0);
    state = run(state, { type: 'next' }, { type: 'next' });
    expect(currentStep(state)).toBe('camera');
    state = tourReducer(state, { type: 'back' });
    expect(currentStep(state)).toBe('about');
    const end = goTo(state, 'done');
    expect(tourReducer(end, { type: 'next' }).index).toBe(end.index);
  });

  it('reports the progress of the current page', () => {
    const state = run(start(), { type: 'next' });
    expect(progress(state)).toEqual({ index: 1, total: TOUR_STEPS.length, fraction: 1 / (TOUR_STEPS.length - 1) });
  });

  it('marks a skipped permission for later and moves on', () => {
    const state = run(goTo(start(), 'overlay'), { type: 'skip' });
    expect(state.status.overlay).toBe('skipped');
    expect(currentStep(state)).toBe('notifications');
    // The pages passed with Next on the way are left for later too.
    expect(leftForLater(state)).toEqual(['camera', 'microphone', 'accessibility', 'overlay']);
  });

  it('counts the welcome pages as seen, not as left for later', () => {
    const state = goTo(start(), 'camera');
    expect(state.status.welcome).toBe('done');
    expect(state.status.about).toBe('done');
    expect(leftForLater(state)).toEqual([]);
  });

  it('jumps to the last page with skip all and keeps what was done', () => {
    const state = run(start(), { type: 'next' }, { type: 'skipAll' });
    expect(currentStep(state)).toBe('done');
    expect(state.status.about).toBe('done');
    expect(leftForLater(state)).toContain('camera');
    expect(leftForLater(state)).toContain('practice-pinch');
  });

  it('finishes from the last page, by finish or by skip, and ignores events after that', () => {
    const atEnd = goTo(start(), 'done');
    const finished = tourReducer(atEnd, { type: 'finish' });
    expect(finished.finished).toBe(true);
    expect(tourReducer(atEnd, { type: 'skip' }).finished).toBe(true);
    expect(tourReducer(finished, { type: 'back' })).toBe(finished);
  });
});

describe('permissions', () => {
  it('celebrates a permission granted while its page is open, then moves on with advance', () => {
    let state = goTo(startTour({ androidAccess: true, checklist: NOTHING }), 'camera');
    state = tourReducer(state, { type: 'checklist', checklist: { ...NOTHING, camera: true } });
    expect(state.status.camera).toBe('done');
    expect(state.success).toBe('camera');
    expect(currentStep(state)).toBe('camera');
    state = tourReducer(state, { type: 'advance' });
    expect(currentStep(state)).toBe('microphone');
    expect(state.success).toBeNull();
  });

  it('records permissions granted elsewhere without moving the current page', () => {
    let state = goTo(startTour({ androidAccess: true, checklist: NOTHING }), 'camera');
    state = tourReducer(state, { type: 'checklist', checklist: { ...NOTHING, overlay: true } });
    expect(state.status.overlay).toBe('done');
    expect(state.success).toBeNull();
    expect(currentStep(state)).toBe('camera');
  });

  it('celebrates a special access the phone reports while its page is open', () => {
    let state = goTo(startTour({ androidAccess: true, checklist: NOTHING }), 'mediaAccess');
    state = tourReducer(state, { type: 'access', step: 'mediaAccess' });
    expect(state.status.mediaAccess).toBe('done');
    expect(state.success).toBe('mediaAccess');
    expect(tourReducer(state, { type: 'access', step: 'mediaAccess' })).toBe(state);
  });

  it('does not let a later skip undo a granted permission', () => {
    let state = goTo(startTour({ androidAccess: true, checklist: NOTHING }), 'microphone');
    state = run(state, { type: 'checklist', checklist: { ...NOTHING, microphone: true } }, { type: 'skip' });
    expect(state.status.microphone).toBe('done');
  });
});

describe('practice', () => {
  it.each(PRACTICE_STEPS.map((step) => [step] as const))('%s completes on its own gesture only', (step) => {
    let state = goTo(startTour({ androidAccess: false, checklist: EVERYTHING }), step);
    state = tourReducer(state, { type: 'gesture', key: 'swipe_three_down' });
    expect(state.status[step]).toBeUndefined();
    state = tourReducer(state, { type: 'gesture', key: PRACTICE_TARGETS[step][0] });
    expect(state.status[step]).toBe('done');
    expect(state.success).toBe(step);
    expect(currentStep(tourReducer(state, { type: 'advance' }))).not.toBe(step);
  });

  it('accepts either direction of the volume knob', () => {
    const state = goTo(startTour({ androidAccess: false, checklist: EVERYTHING }), 'practice-knob');
    expect(tourReducer(state, { type: 'gesture', key: 'pinch_circle_ccw' }).status['practice-knob']).toBe('done');
  });

  it('moves on with Next when the gesture never comes, and lists the practice for later', () => {
    const state = run(goTo(startTour({ androidAccess: false, checklist: EVERYTHING }), 'practice-point'), { type: 'next' });
    expect(state.status['practice-point']).toBe('skipped');
    expect(currentStep(state)).toBe('practice-pinch');
  });

  it('ignores advance when nothing succeeded', () => {
    const state = goTo(startTour({ androidAccess: false, checklist: EVERYTHING }), 'practice-palm');
    expect(tourReducer(state, { type: 'advance' })).toBe(state);
  });
});

describe('voice and confirmation practice', () => {
  it('completes the voice page when the dry run shows a plan', () => {
    let state = goTo(startTour({ androidAccess: false, checklist: EVERYTHING }), 'voice');
    state = tourReducer(state, { type: 'practiced' });
    expect(state.status.voice).toBe('done');
    expect(state.success).toBe('voice');
  });

  it('answers the confirmation with a pinch for yes or a fist for no, once', () => {
    const atConfirm = goTo(startTour({ androidAccess: false, checklist: EVERYTHING }), 'confirm');
    const yes = tourReducer(atConfirm, { type: 'gesture', key: 'pinch' });
    expect(yes.answer).toBe('yes');
    expect(yes.success).toBe('confirm');
    expect(tourReducer(yes, { type: 'gesture', key: 'fist' }).answer).toBe('yes');
    expect(tourReducer(atConfirm, { type: 'gesture', key: 'fist' }).answer).toBe('no');
    expect(tourReducer(atConfirm, { type: 'answer', answer: 'no' }).answer).toBe('no');
  });

  it('forgets the answer when the person goes back to the page later', () => {
    const answered = tourReducer(goTo(startTour({ androidAccess: false, checklist: EVERYTHING }), 'confirm'), {
      type: 'answer',
      answer: 'yes',
    });
    const again = run(answered, { type: 'advance' }, { type: 'back' });
    expect(currentStep(again)).toBe('confirm');
    expect(again.answer).toBeNull();
    expect(again.status.confirm).toBe('done');
  });
});

describe('saving the tutorial', () => {
  it('shows it on the first launch and again for a newer tutorial', () => {
    expect(needsTour(null)).toBe(true);
    expect(needsTour({ version: TOUR_VERSION - 1, completedAt: 1, skipped: [] })).toBe(true);
    expect(needsTour({ version: TOUR_VERSION, completedAt: 1, skipped: [] })).toBe(false);
  });

  it('saves the version, the time and what was left for later', () => {
    const state = run(startTour({ androidAccess: true, checklist: NOTHING }), { type: 'skipAll' }, { type: 'finish' });
    const record = completionRecord(state, 1234);
    expect(record.version).toBe(TOUR_VERSION);
    expect(record.completedAt).toBe(1234);
    expect(record.skipped).toContain('camera');
  });

  it('reads saved records and tolerates broken ones', () => {
    expect(parseTourRecord({ version: 1, completedAt: 5, skipped: ['camera', 'nonsense'] })).toEqual({
      version: 1,
      completedAt: 5,
      skipped: ['camera'],
    });
    expect(parseTourRecord(null)).toBeNull();
    expect(parseTourRecord({ version: '1' })).toBeNull();
    expect(parseTourRecord({ version: 1, completedAt: 2 })).toEqual({ version: 1, completedAt: 2, skipped: [] });
  });
});
