export type CursorState = 'idle' | 'hover' | 'press' | 'drag';

export interface SigilControlStatus {
  /** The user enabled "Sigil hands free control" in the accessibility settings. */
  accessibilityEnabled: boolean;
  /** The "display over other apps" permission, used by the fallback cursor window. */
  overlayPermission: boolean;
  cameraServiceRunning: boolean;
  /** Package of the app in front, as last reported by the accessibility service. */
  foregroundPackage: string | null;
  sdkInt: number;
}

export interface ScreenSize {
  /** Full display size in physical pixels, the unit of every coordinate in this module. */
  width: number;
  height: number;
  density: number;
}

/** One visible node of the active window, flattened breadth first. */
export interface WindowNode {
  /** Path of child indexes from the root, for example 0.2.1. Valid for one snapshot only. */
  id: string;
  text: string | null;
  description: string | null;
  resourceId: string | null;
  className: string | null;
  left: number;
  top: number;
  right: number;
  bottom: number;
  clickable: boolean;
  editable: boolean;
  focused: boolean;
  scrollable: boolean;
}

export type GlobalActionName =
  | 'back'
  | 'home'
  | 'recents'
  | 'notifications'
  | 'quick_settings'
  | 'lock_screen'
  | 'screenshot';

export type SigilControlEvents = {
  onServiceStateChanged: (event: { enabled: boolean }) => void;
  onForegroundAppChanged: (event: { packageName: string; className: string | null }) => void;
  onCameraServiceStateChanged: (event: { running: boolean; microphone?: boolean; error?: string }) => void;
  /** 21 landmarks packed as x, y, z triples, mirrored to the user's view. */
  onHandFrame: (event: { t: number; landmarks: number[]; score: number }) => void;
  onCursorError: (event: { message: string }) => void;
};
