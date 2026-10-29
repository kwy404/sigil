import type { Messages } from '../i18n';
import type { ChecklistItem, SessionState } from '../session/types';
import type { StatusTone } from '../ui/theme';

/** Permissions in the order Sigil asks for them. Restricted settings comes right before the accessibility switch it unlocks. */
export const CHECKLIST_ORDER: readonly ChecklistItem[] = [
  'camera',
  'microphone',
  'restrictedSettings',
  'accessibility',
  'overlay',
  'notifications',
];

export const OPTIONAL_ITEMS: readonly ChecklistItem[] = ['notifications'];

/** Items still to fix, in order. Restricted settings only matters while accessibility is off. */
export function missingItems(checklist: Readonly<Record<ChecklistItem, boolean>>): ChecklistItem[] {
  return CHECKLIST_ORDER.filter((item) => {
    if (checklist[item]) return false;
    if (item === 'restrictedSettings') return !checklist.accessibility;
    return true;
  });
}

export function essentialMissing(checklist: Readonly<Record<ChecklistItem, boolean>>): ChecklistItem[] {
  return missingItems(checklist).filter((item) => !OPTIONAL_ITEMS.includes(item));
}

export interface SessionStatus {
  tone: StatusTone;
  /** Short mono label for chips: TRACKING, PAUSED. */
  label: string;
  /** One line for people: "Active · right hand". */
  line: string;
  /** The dot breathes. */
  live: boolean;
}

export function sessionStatus(session: SessionState, m: Messages): SessionStatus {
  const t = m.ui;
  if (session.listening) {
    return { tone: 'info', label: t.status.listening, line: t.session.lineListening, live: true };
  }
  switch (session.phase) {
    case 'tracking': {
      const hand = t.hand[session.hand];
      return { tone: 'accent', label: t.status.tracking, line: t.session.lineTracking(hand), live: true };
    }
    case 'starting':
      return { tone: 'accent', label: t.status.starting, line: t.session.lineStarting, live: true };
    case 'paused':
      return { tone: 'warning', label: t.status.paused, line: t.session.linePaused, live: false };
    case 'error':
      return { tone: 'danger', label: t.status.error, line: errorText(session.error, m), live: false };
    case 'off':
      if (essentialMissing(session.checklist).length > 0) {
        return { tone: 'warning', label: t.status.needsSetup, line: t.session.lineNeedsSetup, live: false };
      }
      return { tone: 'neutral', label: t.status.off, line: t.session.lineOff, live: false };
  }
}

/** The session error in words; unknown codes from the native session are shown as they come. */
export function errorText(error: string | null, m: Messages): string {
  const known = m.ui.session.errors;
  if (error === 'camera_permission') return known.cameraPermission;
  if (error === 'camera_service') return known.cameraService;
  return error ? known.generic(error) : m.ui.session.lineError;
}

/** Glyph of a checklist item. */
export const CHECKLIST_GLYPH = {
  camera: 'camera-tracking',
  microphone: 'mic',
  accessibility: 'accessibility',
  overlay: 'layers',
  notifications: 'bell',
  restrictedSettings: 'privacy-shield',
} as const satisfies Record<ChecklistItem, string>;
