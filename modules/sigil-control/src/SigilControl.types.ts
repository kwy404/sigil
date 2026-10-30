/** lost: the hand left; the cursor stays where it was, faded, until the hand returns. */
export type CursorState = 'idle' | 'hover' | 'press' | 'drag' | 'lost';

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
  /**
   * 21 landmarks packed as x, y, z triples, mirrored to the user's view; empty when the hand is lost.
   * Self test frames are synthetic and name their test photo in fixture.
   */
  onHandFrame: (event: {
    t: number;
    landmarks: number[];
    score: number;
    handedness: 'left' | 'right' | null;
    synthetic?: boolean;
    fixture?: string | null;
    /** Every hand found, up to two, for choosing the user's hand. */
    hands?: { landmarks: number[]; score: number; handedness: 'left' | 'right' | null }[] | null;
    /** Width over height of the upright frame. */
    aspect?: number;
    /** Mean brightness of the frame from 0 to 255, or -1 when unknown. */
    brightness?: number;
  }) => void;
  /** The camera (starting, ok, busy, disabled or error), the phone's heat, the frame rate and the display rotation. */
  onTrackerState: (event: TrackerStateEvent) => void;
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

/** What the floating bubble shows; dark, camera and hot say why the hand does not act. */
export type BubbleStateName = 'tracking' | 'hand' | 'listening' | 'paused' | 'dark' | 'camera' | 'hot';

export interface TrackerStateEvent {
  /** starting, ok, busy (another app holds the camera), disabled or error. */
  camera: string;
  /** PowerManager thermal status: 0 none, 1 light, 2 moderate, 3 severe and up. */
  thermal: number;
  /** full, idle (no hand for a while) or hot (fewer frames while the phone is warm). */
  rate: string;
  /** Display rotation in degrees. */
  rotation: number;
}

export type ControlAction = 'pause' | 'resume' | 'microphone' | 'stop';

/** What the hand tracker did, stage by stage. Rates are per second, totals since the tracker started. */
export interface TrackerSnapshot {
  /** none, mediapipe, or idle when the build has no model. */
  pipeline: string;
  modelLoaded: boolean;
  modelLoadMs: number;
  cameraId: string | null;
  /** CameraX state: PENDING_OPEN, OPENING, OPEN, CLOSING or CLOSED. */
  cameraState: string | null;
  frameWidth: number;
  frameHeight: number;
  rotationDegrees: number;
  targetRotation: number;
  /** Mean brightness of the last frame, 0 to 255, or -1. */
  brightness: number;
  camera: string;
  thermal: number;
  rate: string;
  /** Frames from CameraX per second. */
  cameraFps: number;
  /** Frames handed to MediaPipe per second. */
  sentFps: number;
  /** Results from MediaPipe per second. */
  resultFps: number;
  /** Results with a hand per second. */
  handFps: number;
  cameraFrames: number;
  sentFrames: number;
  results: number;
  handsFound: number;
  lastHandAt: number;
  startedAt: number;
  /** Where the last error happened: camera_bind, camera_state, landmarker_create, frame_convert, detect, error_listener, selftest. */
  lastErrorStage: string | null;
  lastError: string | null;
  lastErrorAt: number;
  selfTestRunning: boolean;
  selfTest: Record<string, unknown> | null;
}

/** The phone, the accesses, the camera service and the tracker, for the diagnostics page and its report. */
export interface DiagnosticsSnapshot {
  manufacturer: string;
  model: string;
  androidVersion: string;
  sdkInt: number;
  abi: string;
  appVersion: string;
  accessibilityEnabled: boolean;
  overlayPermission: boolean;
  cameraPermission: boolean;
  /** Android may stop the camera service to save battery. */
  batteryOptimized: boolean;
  serviceRunning: boolean;
  servicePaused: boolean;
  /** The lifecycle CameraX is bound to: RESUMED while tracking. */
  lifecycle: string;
  tracker: TrackerSnapshot;
}
