import type { ExecutionResult } from '../sigil-core/executor';
import type { PlanOutcome } from '../sigil-core/planner';

/** off: nothing runs; starting: permissions and the camera service; tracking: the hand is followed; paused: the camera is off; error: it could not start. */
export type SessionPhase = 'off' | 'starting' | 'tracking' | 'paused' | 'error';

/** What Sigil needs to control other apps. Each item is true when it is ready (restrictedSettings: nothing blocks the service). */
export type ChecklistItem = 'accessibility' | 'overlay' | 'camera' | 'microphone' | 'notifications' | 'restrictedSettings';

export interface SessionState {
  phase: SessionPhase;
  hand: 'none' | 'left' | 'right';
  listening: boolean;
  /** Microphone level from 0 to 1 while listening or waiting for an answer. */
  micLevel: number;
  /** The last gesture, as a GestureKey such as pinch or swipe_two_left. */
  lastGesture: string | null;
  lastCommand: { text: string; at: number; outcome: 'done' | 'failed' | 'cancelled' | 'not_understood' } | null;
  checklist: Record<ChecklistItem, boolean>;
  /** Media volume and brightness from 0 to 1, or null where they cannot be read. */
  levels: { volume: number | null; brightness: number | null };
  error: string | null;
}

export interface SessionActions {
  /** Asks for the permissions it needs, then starts the camera service, the cursor and the bubble. */
  start(): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  /** Listens for one voice request and carries it out. */
  listen(): void;
  stopListening(): void;
  /** Opens the permission dialog or the settings screen that fixes an item. */
  fix(item: ChecklistItem): void;
  setVolume(percent: number): Promise<void>;
  setBrightness(percent: number): Promise<void>;
}

/** A request planned with planRequest: the plan or why there is none, and the run when it was carried out. */
export interface PlanRequestResult {
  outcome: PlanOutcome;
  /** Null for a dry run, or when the plan was not run. */
  result: ExecutionResult | null;
}
