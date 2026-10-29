import { NativeModule, requireOptionalNativeModule } from 'expo';

export interface MemoryInfo {
  totalBytes: number;
  /** Memory Android could give apps now, including caches it can drop. */
  availableBytes: number;
  /** Below this much available memory Android starts killing background apps. */
  thresholdBytes: number;
  lowMemory: boolean;
}

export interface MemoryPressureEvent {
  /** An Android ComponentCallbacks2 TRIM_MEMORY level: 5, 10 and 15 while visible, 20 once hidden, 40 to 80 in the background. */
  level: number;
}

export type SigilMemoryEvents = {
  onMemoryPressure: (event: MemoryPressureEvent) => void;
};

declare class SigilMemoryNativeModule extends NativeModule<SigilMemoryEvents> {
  cpuCores(): number;
  memoryInfo(): MemoryInfo;
}

/** The native module, or null on iOS, the web, Expo Go and in unit tests. */
export default requireOptionalNativeModule<SigilMemoryNativeModule>('SigilMemory');
