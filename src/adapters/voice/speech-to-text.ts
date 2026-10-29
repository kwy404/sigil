/**
 * Port for on device speech to text. Android uses the platform recognizer
 * through the sigil-control module (NativeSpeechToText); other builds use the
 * mock engine. Candidates and their trade offs are in docs/MODULES.md.
 */
export interface ListenOptions {
  /** BCP 47 locale, for example pt-BR or en-US. */
  locale: string;
  /** Hard limit for one request, in milliseconds. */
  maxDurationMs?: number;
  /** Give up when nobody starts speaking within this time, in milliseconds. */
  noSpeechMs?: number;
  /** Called with the growing transcript while the user speaks. */
  onPartial?: (text: string) => void;
  /** Called a few times a second with the microphone level from 0 to 1 and whether the room is too noisy. */
  onLevel?: (level: number, noisy: boolean) => void;
  signal?: AbortSignal;
}

export interface Alternative {
  text: string;
  /** From 0 to 1, or null when the engine gives none. */
  confidence: number | null;
}

export interface Transcript {
  text: string;
  locale: string;
  /** Engine confidence from 0 to 1, or null when the engine does not report one. */
  confidence: number | null;
  /** Other readings of the same speech, best first, without the main one. */
  alternatives?: Alternative[];
  durationMs: number;
  engine: string;
  /** True when the room was noisy while the user spoke. */
  noisy?: boolean;
}

export interface SpeechToText {
  readonly id: string;
  /** True when audio never leaves the device. */
  readonly onDevice: boolean;
  isAvailable(): Promise<boolean>;
  listen(options: ListenOptions): Promise<Transcript>;
}

export class ListenAbortedError extends Error {
  constructor() {
    super('Listening was cancelled.');
    this.name = 'ListenAbortedError';
  }
}

/** Why a capture held no clear speech. */
export type UnclearReason = 'no_speech' | 'too_short' | 'clipped' | 'too_quiet' | 'no_match';

/**
 * The capture held no clear speech: none at all, too short, mostly clipped,
 * too quiet against the noise, or no words the recognizer could find. Nothing
 * should run; the user is asked to repeat.
 */
export class UnclearSpeechError extends Error {
  constructor(
    readonly reason: UnclearReason,
    readonly noisy: boolean,
  ) {
    super(`The speech was not clear (${reason}).`);
    this.name = 'UnclearSpeechError';
  }
}

/** Why listening is not possible here and now. */
export type UnavailableReason =
  | 'busy'
  | 'permission'
  | 'on_device_unavailable'
  | 'no_recognizer'
  | 'language_unsupported'
  | 'language_unavailable'
  | 'network'
  | 'audio'
  | 'server'
  | 'other';

/**
 * Listening is not possible: no microphone permission, no on device
 * recognizer (and no consent to another one), no recognizer at all, a
 * language the phone cannot recognize, a busy recognizer or another error.
 */
export class SpeechUnavailableError extends Error {
  constructor(readonly reason: UnavailableReason) {
    super(`Speech recognition is not available (${reason}).`);
    this.name = 'SpeechUnavailableError';
  }
}
