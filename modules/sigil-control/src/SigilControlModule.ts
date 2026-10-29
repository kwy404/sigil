import { NativeModule, requireOptionalNativeModule } from 'expo';

import type {
  BrightnessChange,
  BrightnessLevel,
  ControlOutcome,
  CursorState,
  GlobalActionName,
  MediaKeyName,
  ScreenSize,
  SettingsPanelName,
  SigilControlEvents,
  SigilControlStatus,
  VolumeChange,
  VolumeLevel,
  VolumeStreamName,
  WindowNode,
} from './SigilControl.types';

declare class SigilControlNativeModule extends NativeModule<SigilControlEvents> {
  getStatus(): SigilControlStatus;
  getScreenSize(): ScreenSize;
  openAccessibilitySettings(): boolean;
  openOverlaySettings(): boolean;
  /** "Modify system settings" for Sigil, needed for the brightness. */
  openWriteSettings(): boolean;
  /** Notification access for Sigil's media listener, needed to seek and change the speed. */
  openMediaAccessSettings(): boolean;
  /** Wi-Fi, Bluetooth, Do Not Disturb or display settings; the user flips the switch there. */
  openPanel(panel: SettingsPanelName): boolean;
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
  mediaKey(action: MediaKeyName): Promise<boolean>;
  /** Moves the player in front by this many seconds, back when negative. Needs media access. */
  seekBy(seconds: number): Promise<ControlOutcome>;
  /** Needs media access and Android 10 or later. */
  setPlaybackSpeed(rate: number): Promise<ControlOutcome>;
  /** One step of the media volume, with the system volume panel. Used by gestures. */
  adjustVolume(direction: 'up' | 'down'): Promise<boolean>;
  /** up and down move about 10 percent; set takes a percent in level. */
  changeVolume(stream: VolumeStreamName, change: VolumeChange, level: number): Promise<ControlOutcome>;
  getVolume(stream: VolumeStreamName): VolumeLevel;
  /** up and down move by level percent of the slider; set goes to level percent. */
  changeBrightness(change: BrightnessChange, level: number): Promise<ControlOutcome>;
  getBrightness(): BrightnessLevel;
  openApp(packageName: string | null, url: string | null, label: string | null): Promise<boolean>;
}

/**
 * The native module, or null where it does not exist: iOS, the web, Expo Go
 * and unit tests. Callers must handle null; src/system-control does.
 */
export default requireOptionalNativeModule<SigilControlNativeModule>('SigilControl');
