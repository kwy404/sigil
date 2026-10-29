import { MockSpeechToText } from './mock-speech';
import type { SpeechToText } from './speech-to-text';

export { MockSpeechToText, type MockSpeechOptions } from './mock-speech';
export { NativeSpeechToText, toTranscript, type SpeechModule } from './native-speech';
export {
  ListenAbortedError,
  SpeechUnavailableError,
  UnclearSpeechError,
  type Alternative,
  type ListenOptions,
  type SpeechToText,
  type Transcript,
  type UnavailableReason,
  type UnclearReason,
} from './speech-to-text';

/** Requests the mock engine "hears" in development builds. */
export const DEMO_UTTERANCES: readonly string[] = [
  'open YouTube',
  'send a message to Ana on WhatsApp saying I am on my way',
  'manda uma mensagem pra mãe no zap dizendo que estou chegando',
  'search for lofi beats on YouTube',
  'scroll down',
];

/**
 * A scripted engine that "hears" the given sentences, so screens can show the
 * voice flow where no recognizer exists (iOS, the web, Expo Go). On Android
 * the runtime uses NativeSpeechToText instead.
 */
export function createSpeechToText(script: readonly string[] = DEMO_UTTERANCES): SpeechToText {
  return new MockSpeechToText(script.length > 0 ? script : DEMO_UTTERANCES);
}
