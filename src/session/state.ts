import type { SigilState } from '../runtime/sigil';
import type { VoiceState } from '../voice/session';
import type { SessionPhase } from './types';

/** The session phase from the runtime: starting, tracking or paused while the service runs, error when it could not start. */
export function sessionPhase(runtime: Pick<SigilState, 'starting' | 'running' | 'paused' | 'error'>, startError: string | null): SessionPhase {
  if (runtime.starting) return 'starting';
  if (runtime.running) return runtime.paused ? 'paused' : 'tracking';
  return startError || runtime.error ? 'error' : 'off';
}

/** True while Sigil listens for a request or waits for a spoken answer. */
export function isListening(voice: VoiceState): boolean {
  return voice.phase === 'listening' || voice.phase === 'confirm' || voice.phase === 'choose';
}

/** The microphone level while listening, 0 otherwise. */
export function micLevel(voice: VoiceState): number {
  return isListening(voice) && 'level' in voice ? voice.level : 0;
}
