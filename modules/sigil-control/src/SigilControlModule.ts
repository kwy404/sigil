import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  CursorState,
  GlobalActionName,
  ScreenSize,
  SigilControlEvents,
  SigilControlStatus,
  WindowNode,
} from './SigilControl.types';

declare class SigilControlNativeModule extends NativeModule<SigilControlEvents> {
  getStatus(): SigilControlStatus;
  getScreenSize(): ScreenSize;
  openAccessibilitySettings(): boolean;
  openOverlaySettings(): boolean;
  /** Needs the CAMERA permission and Sigil on screen. Returns false when it cannot start. */
  startCameraService(withMicrophone: boolean): boolean;
  stopCameraService(): void;
  showCursor(): boolean;
  hideCursor(): void;
  /** Screen pixel coordinates. Cheap enough to call on every camera frame. */
  moveCursor(x: number, y: number, state: CursorState): void;
  tap(x: number, y: number): Promise<boolean>;
  doubleTap(x: number, y: number): Promise<boolean>;
  longPress(x: number, y: number, durationMs: number): Promise<boolean>;
  swipe(fromX: number, fromY: number, toX: number, toY: number, durationMs: number): Promise<boolean>;
  globalAction(name: GlobalActionName): Promise<boolean>;
  typeText(text: string, submit: boolean): Promise<boolean>;
  scroll(direction: 'up' | 'down' | 'left' | 'right'): Promise<boolean>;
  snapshotWindow(maxNodes: number): Promise<WindowNode[]>;
  mediaKey(action: 'play_pause' | 'next' | 'previous'): Promise<boolean>;
  adjustVolume(direction: 'up' | 'down'): Promise<boolean>;
  openApp(packageName: string | null, url: string | null, label: string | null): Promise<boolean>;
}

/**
 * The native module, or null where it does not exist: iOS, the web, Expo Go
 * and unit tests. Callers must handle null; src/system-control does.
 */
export default requireOptionalNativeModule<SigilControlNativeModule>('SigilControl');
