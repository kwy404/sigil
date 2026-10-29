export type CursorState = 'idle' | 'hover' | 'press' | 'drag';

export interface SigilControlStatus {
  /** The user enabled "Sigil hands free control" in the accessibility settings. */
  accessibilityEnabled: boolean;
  /** The "display over other apps" permission, used by the fallback cursor window. */
  overlayPermission: boolean;
  cameraServiceRunning: boolean;
  /** Tracking is paused: the camera is off while the service, the bubble and the notification stay. */
  trackingPaused: boolean;
  /** Package of the app in front, as last reported by the accessibility service. */
  foregroundPackage: string | null;
  /** "Modify system settings", needed to change the screen brightness. */
  writeSettings: boolean;
  /** Sigil's media listener is enabled, so it can seek and change the speed of the player in front. */
  mediaAccess: boolean;
  sdkInt: number;
  /** Sigil's own package, so a request made while Sigil is in front does not close or drive Sigil itself. */
  packageName: string;
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
  | 'screenshot'
  | 'power_menu'
  | 'previous_app'
  | 'split_screen';

export type MediaKeyName = 'play_pause' | 'play' | 'pause' | 'next' | 'previous';

export type VolumeStreamName = 'media' | 'ring' | 'alarm';

export type VolumeChange = 'up' | 'down' | 'set' | 'mute' | 'unmute';

export type BrightnessChange = 'up' | 'down' | 'set';

export type SettingsPanelName = 'wifi' | 'bluetooth' | 'do_not_disturb' | 'display';

/**
 * Outcome of a system control: done, the special access that is missing
 * (write_settings or media_access), unsupported on this phone, busy (the
 * camera holds the flashlight), or failed.
 */
export type ControlOutcome = 'done' | 'write_settings' | 'media_access' | 'unsupported' | 'busy' | 'failed';

/** An app the launcher lists. */
export interface LaunchableApp {
  label: string;
  packageName: string;
}

/** The default app of a kind, opened without knowing its package. */
export type AppRoleName =
  | 'camera'
  | 'phone'
  | 'contacts'
  | 'calculator'
  | 'calendar'
  | 'clock'
  | 'gallery'
  | 'music'
  | 'email'
  | 'maps'
  | 'files'
  | 'messages'
  | 'browser';

export interface InstallSource {
  /** Package of the app that installed Sigil, null when Android does not say (adb, some file managers). */
  installer: string | null;
  /** Android 13 or later and not from the Play Store: the accessibility service needs "Allow restricted settings" first. */
  restrictedSettings: boolean;
}

export interface VolumeLevel {
  /** Position from 0 to 1 between the lowest and the highest index of the stream. */
  level: number;
  index: number;
  min: number;
  max: number;
  muted: boolean;
}

export interface BrightnessLevel {
  /** Position of the system brightness slider, from 0 to 1. */
  level: number;
  /** Adaptive brightness is on. Sigil turns it off when it sets the brightness. */
  automatic: boolean;
  /** Sigil holds "Modify system settings". */
  writable: boolean;
}

export type SigilControlEvents = {
  onServiceStateChanged: (event: { enabled: boolean }) => void;
  onForegroundAppChanged: (event: { packageName: string; className: string | null }) => void;
  onCameraServiceStateChanged: (event: { running: boolean; paused?: boolean; microphone?: boolean; error?: string }) => void;
  /** The bubble menu or the notification asked for pause, resume, microphone or stop. */
  onControlAction: (event: { action: ControlAction }) => void;
  /** 21 landmarks packed as x, y, z triples, mirrored to the user's view; empty when the hand is lost. */
  onHandFrame: (event: { t: number; landmarks: number[]; score: number; handedness: 'left' | 'right' | null }) => void;
  onCursorError: (event: { message: string }) => void;
  /** An app was installed, removed or updated; read getLaunchableApps again. */
  onAppsChanged: () => void;
  onSpeechState: (event: { state: SpeechStateName; onDevice: boolean }) => void;
  /** The microphone level from 0 to 1 and whether the room is too noisy, a few times a second. */
  onSpeechLevel: (event: { level: number; noisy: boolean }) => void;
  onSpeechPartial: (event: { text: string }) => void;
  onSpeechResult: (event: SpeechResultEvent) => void;
  onSpeechError: (event: { code: SpeechErrorCode; message: string }) => void;
};

/**
 * What on device speech recognition can do for a language: ready, downloading,
 * download (Android can fetch the model), unsupported, off_device_only (only a
 * recognizer that may use the network), none, or unknown (Android 12).
 */
export type SpeechSupport = 'ready' | 'downloading' | 'download' | 'unsupported' | 'off_device_only' | 'none' | 'unknown';

/** Why listening could not start. */
export type ListenProblem = 'busy' | 'permission' | 'on_device_unavailable' | 'no_recognizer';

export type SpeechStateName = 'listening' | 'speech' | 'processing' | 'cancelled';

/** Why a capture was not trusted: no speech, too short, mostly clipped, too quiet against the noise, or no words found. */
export type SpeechRejection = 'no_speech' | 'too_short' | 'clipped' | 'too_quiet' | 'no_match';

export type SpeechErrorCode =
  | 'network'
  | 'audio'
  | 'server'
  | 'busy'
  | 'permission'
  | 'language_unsupported'
  | 'language_unavailable'
  | 'no_recognizer'
  | 'other';

export interface SpeechResultEvent {
  /** The recognizer's alternatives, best first; empty when the capture was rejected. */
  texts: string[];
  /** Confidence of each alternative from 0 to 1, or -1 when the recognizer gives none. */
  confidences: number[];
  /** False when the voice gate rejected the capture: nothing should run. */
  accepted: boolean;
  reason: SpeechRejection | null;
  onDevice: boolean;
  speechMs: number;
  snrDb: number;
  noisy: boolean;
}

export type PromptTone = 'info' | 'listening' | 'question' | 'warning';

/** What the floating bubble shows. */
export type BubbleStateName = 'tracking' | 'hand' | 'listening' | 'paused';

export type ControlAction = 'pause' | 'resume' | 'microphone' | 'stop';
