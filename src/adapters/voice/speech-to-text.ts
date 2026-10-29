/**
 * Port for on device speech to text. Candidates and their trade offs are in
 * docs/MODULES.md: whisper.rn (whisper.cpp), the platform recognizers through
 * expo-speech-recognition, and Vosk. Until one of them is wired in, the app
 * uses MockSpeechToText.
 */
export interface ListenOptions {
  /** BCP 47 locale, for example pt-BR or en-US. */
  locale: string;
  /** Hard limit for one request, in milliseconds. */
  maxDurationMs?: number;
  /** Stop after this much silence once speech has started, in milliseconds. */
  endSilenceMs?: number;
  /** Called with the growing transcript while the user speaks. */
  onPartial?: (text: string) => void;
  signal?: AbortSignal;
}

export interface Transcript {
  text: string;
  locale: string;
  /** Engine confidence from 0 to 1, or null when the engine does not report one. */
  confidence: number | null;
  durationMs: number;
  engine: string;
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
