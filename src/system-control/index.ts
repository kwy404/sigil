import { PermissionsAndroid, Platform } from 'react-native';

import type { DeviceController } from '../sigil-core/executor';
import { AndroidDeviceController, InAppDeviceController } from './devices';
import { getNativeControl, type NativeControl } from './native';

export {
  AndroidDeviceController,
  InAppDeviceController,
  toControlResult,
  toUiNode,
  VOICE_BRIGHTNESS_STEP,
} from './devices';
export {
  dispatchProfileAction,
  GESTURE_BRIGHTNESS_STEP,
  type DispatchContext,
  type GestureTarget,
  type SigilUi,
} from './dispatch';
export { getNativeControl, type NativeControl } from './native';

/**
 * android-system: the accessibility service is on, Sigil can act on any app.
 * android-setup: the native module is there but the user has not enabled the service yet.
 * in-app: iOS, Expo Go or the web. Sigil works inside its own screens, with deep links and Shortcuts.
 */
export type ControlMode = 'android-system' | 'android-setup' | 'in-app';

export interface SystemControl {
  mode: ControlMode;
  native: NativeControl | null;
  device: DeviceController;
}

export function getSystemControl(): SystemControl {
  const native = getNativeControl();
  if (Platform.OS === 'android' && native) {
    const enabled = native.getStatus().accessibilityEnabled;
    return {
      mode: enabled ? 'android-system' : 'android-setup',
      native,
      device: enabled ? new AndroidDeviceController(native) : new InAppDeviceController(),
    };
  }
  return { mode: 'in-app', native: null, device: new InAppDeviceController() };
}

export function describeMode(mode: ControlMode): string {
  switch (mode) {
    case 'android-system':
      return 'System wide control is on. Gestures and plans can act on any app.';
    case 'android-setup':
      return 'Enable "Sigil hands free control" in the accessibility settings to control other apps.';
    case 'in-app':
      return Platform.OS === 'ios'
        ? 'iOS does not let apps control or draw over other apps. Sigil works in its own screens and through Shortcuts.'
        : 'The native module is not in this build (Expo Go or web). Sigil runs in its own screens only.';
  }
}

export interface PermissionResult {
  camera: boolean;
  microphone: boolean;
  notifications: boolean;
}

/** Asks for the runtime permissions the camera service needs. Android only. */
export async function requestControlPermissions(options: { microphone: boolean }): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { camera: false, microphone: false, notifications: false };
  }
  const { PERMISSIONS, RESULTS } = PermissionsAndroid;
  type AndroidPermission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
  const wanted: AndroidPermission[] = [PERMISSIONS.CAMERA];
  if (options.microphone) {
    wanted.push(PERMISSIONS.RECORD_AUDIO);
  }
  if (typeof Platform.Version === 'number' && Platform.Version >= 33) {
    wanted.push(PERMISSIONS.POST_NOTIFICATIONS);
  }
  const results = await PermissionsAndroid.requestMultiple(wanted);
  const granted = (permission: AndroidPermission) => results[permission] === RESULTS.GRANTED;
  return {
    camera: granted(PERMISSIONS.CAMERA),
    microphone: options.microphone && granted(PERMISSIONS.RECORD_AUDIO),
    notifications:
      typeof Platform.Version === 'number' && Platform.Version >= 33 ? granted(PERMISSIONS.POST_NOTIFICATIONS) : true,
  };
}
