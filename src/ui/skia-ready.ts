/**
 * Skia is part of the native app, so it is always ready here. The web build
 * loads CanvasKit first; see skia-ready.web.ts.
 */
export function useSkiaReady(): boolean {
  return true;
}
