export type SessionPhase = 'off' | 'starting' | 'tracking' | 'paused' | 'error';
export type ChecklistItem = 'accessibility' | 'overlay' | 'camera' | 'microphone' | 'notifications' | 'restrictedSettings';
export interface SessionState {
  phase: SessionPhase;
  hand: 'none' | 'left' | 'right';
  listening: boolean;
  micLevel: number;            // 0..1
  lastGesture: string | null;  // GestureKey
  lastCommand: { text: string; at: number; outcome: 'done' | 'failed' | 'cancelled' | 'not_understood' } | null;
  checklist: Record<ChecklistItem, boolean>;
  levels: { volume: number | null; brightness: number | null };
  error: string | null;
}
export interface SessionActions {
  start(): Promise<void>; stop(): void; pause(): void; resume(): void;
  listen(): void; stopListening(): void;
  fix(item: ChecklistItem): void;
  setVolume(percent: number): Promise<void>; setBrightness(percent: number): Promise<void>;
}
export type UseSigilSession = () => SessionState & SessionActions;
