import SigilControl from '../../modules/sigil-control';

/** The Android native module, or null on iOS, the web, Expo Go and in tests. */
export type NativeControl = NonNullable<typeof SigilControl>;

export function getNativeControl(): NativeControl | null {
  return SigilControl;
}
