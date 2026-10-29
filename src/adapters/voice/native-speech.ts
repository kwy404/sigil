import type { SpeechErrorCode, SpeechResultEvent } from '../../../modules/sigil-control';
import type { NativeControl } from '../../system-control/native';
import {
  ListenAbortedError,
  SpeechUnavailableError,
  UnclearSpeechError,
  type ListenOptions,
  type SpeechToText,
  type Transcript,
  type UnavailableReason,
} from './speech-to-text';

const DEFAULT_MAX_MS = 12000;
const DEFAULT_NO_SPEECH_MS = 7000;

/** The native module calls this engine needs; NativeControl satisfies it, tests use a fake. */
export type SpeechModule = Pick<NativeControl, 'startListening' | 'stopListening' | 'cancelListening' | 'getSpeechSupport' | 'addListener'>;

function unavailable(code: SpeechErrorCode): UnavailableReason {
  return code;
}

/** Turns a native result into a transcript, or the reason it is not trusted. */
export function toTranscript(event: SpeechResultEvent, locale: string): Transcript | UnclearSpeechError {
  if (!event.accepted || event.texts.length === 0) {
    return new UnclearSpeechError(event.reason ?? 'no_match', event.noisy);
  }
  const confidence = (index: number) => {
    const value = event.confidences[index];
    return value === undefined || value < 0 ? null : value;
  };
  return {
    text: event.texts[0],
    locale,
    confidence: confidence(0),
    alternatives: event.texts.slice(1).map((text, i) => ({ text, confidence: confidence(i + 1) })),
    durationMs: event.speechMs,
    engine: event.onDevice ? 'android-on-device' : 'android-prefer-offline',
    noisy: event.noisy,
  };
}

/**
 * Speech to text with the Android recognizer through the sigil-control
 * module: transient audio focus, noise suppression and a voice gate in
 * Kotlin, on device recognition first. A recognizer that may use the network
 * is used only when allowOffDevice says the user agreed to it.
 */
export class NativeSpeechToText implements SpeechToText {
  readonly id = 'android';

  constructor(
    private readonly native: SpeechModule,
    private readonly allowOffDevice: () => boolean,
  ) {}

  /** True only when nothing leaves the phone; a recognizer allowed off device may use the network. */
  get onDevice(): boolean {
    return !this.allowOffDevice();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  listen(options: ListenOptions): Promise<Transcript> {
    return new Promise<Transcript>((resolve, reject) => {
      let settled = false;
      const subscriptions = [
        this.native.addListener('onSpeechPartial', (event) => options.onPartial?.(event.text)),
        this.native.addListener('onSpeechLevel', (event) => options.onLevel?.(event.level, event.noisy)),
        this.native.addListener('onSpeechState', (event) => {
          if (event.state === 'cancelled') finish(() => reject(new ListenAbortedError()));
        }),
        this.native.addListener('onSpeechResult', (event) => {
          const transcript = toTranscript(event, options.locale);
          finish(() => (transcript instanceof UnclearSpeechError ? reject(transcript) : resolve(transcript)));
        }),
        this.native.addListener('onSpeechError', (event) => {
          finish(() => reject(new SpeechUnavailableError(unavailable(event.code))));
        }),
      ];
      const onAbort = () => this.native.cancelListening();
      const finish = (settle: () => void) => {
        if (settled) return;
        settled = true;
        subscriptions.forEach((subscription) => subscription.remove());
        options.signal?.removeEventListener('abort', onAbort);
        settle();
      };
      if (options.signal?.aborted) {
        finish(() => reject(new ListenAbortedError()));
        return;
      }
      options.signal?.addEventListener('abort', onAbort);
      const problem = this.native.startListening(
        options.locale,
        this.allowOffDevice(),
        options.maxDurationMs ?? DEFAULT_MAX_MS,
        options.noSpeechMs ?? DEFAULT_NO_SPEECH_MS,
      );
      if (problem) {
        finish(() => reject(new SpeechUnavailableError(problem)));
      }
    });
  }
}
