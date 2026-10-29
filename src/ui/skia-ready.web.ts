import { useSyncExternalStore } from 'react';

const noop = () => () => undefined;

function loaded(): boolean {
  return typeof (globalThis as { CanvasKit?: unknown }).CanvasKit !== 'undefined';
}

/**
 * The web entry (index.web.js) loads CanvasKit before the app starts, so Skia
 * is ready in the browser. While the page renders on the server it is not,
 * and Skia views show their flat vector placeholder; the browser then swaps
 * in the live drawing right after hydration.
 */
export function useSkiaReady(): boolean {
  return useSyncExternalStore(noop, loaded, () => false);
}
