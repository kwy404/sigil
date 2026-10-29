import { ListenAbortedError, type ListenOptions, type SpeechToText, type Transcript } from './speech-to-text';

export interface MockSpeechOptions {
  /** Delay between two partial words, in milliseconds. */
  wordDelayMs?: number;
}

/**
 * Speech to text stand in that "hears" scripted sentences, word by word, so
 * the voice flow can be developed and tested before a native engine exists.
 */
export class MockSpeechToText implements SpeechToText {
  readonly id = 'mock';
  readonly onDevice = true;
  private index = 0;

  constructor(
    private readonly script: readonly string[],
    private readonly options: MockSpeechOptions = {},
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.script.length > 0;
  }

  /** Returns the next scripted sentence, cycling through the script. */
  async listen(options: ListenOptions): Promise<Transcript> {
    if (this.script.length === 0) {
      throw new Error('The mock speech engine has no script.');
    }
    const sentence = this.script[this.index % this.script.length];
    this.index++;
    const delay = this.options.wordDelayMs ?? 120;
    const words = sentence.split(/\s+/).filter(Boolean);
    let elapsed = 0;
    for (let i = 0; i < words.length; i++) {
      if (options.signal?.aborted) {
        throw new ListenAbortedError();
      }
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
        elapsed += delay;
      }
      if (options.maxDurationMs !== undefined && elapsed > options.maxDurationMs) {
        break;
      }
      options.onPartial?.(words.slice(0, i + 1).join(' '));
    }
    if (options.signal?.aborted) {
      throw new ListenAbortedError();
    }
    return { text: sentence, locale: options.locale, confidence: null, durationMs: elapsed, engine: this.id };
  }
}
