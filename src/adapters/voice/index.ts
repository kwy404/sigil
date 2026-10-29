import { MockSpeechToText } from './mock-speech';
import type { SpeechToText } from './speech-to-text';

export { MockSpeechToText, type MockSpeechOptions } from './mock-speech';
export { ListenAbortedError, type ListenOptions, type SpeechToText, type Transcript } from './speech-to-text';

/** Requests the mock engine "hears" in development builds. */
export const DEMO_UTTERANCES: readonly string[] = [
  'open YouTube',
  'send a message to Ana on WhatsApp saying I am on my way',
  'manda uma mensagem pra mãe no zap dizendo que estou chegando',
  'search for lofi beats on YouTube',
  'scroll down',
];

/**
 * Returns the speech engine for this build. Only the mock exists today; a
 * native engine (whisper.rn or the platform recognizer) replaces it once its
 * module is installed, without changes to the callers.
 */
export function createSpeechToText(): SpeechToText {
  return new MockSpeechToText(DEMO_UTTERANCES);
}
