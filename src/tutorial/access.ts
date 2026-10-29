import { PermissionsAndroid, Platform } from 'react-native';

import { getNativeControl, requestControlPermissions } from '../system-control';
import type { AccessStep } from './machine';

/** Whether an access is granted: true, false, or null when this build cannot tell. */
export async function accessGranted(step: AccessStep): Promise<boolean | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  const { PERMISSIONS } = PermissionsAndroid;
  switch (step) {
    case 'camera':
      return PermissionsAndroid.check(PERMISSIONS.CAMERA);
    case 'microphone':
      return PermissionsAndroid.check(PERMISSIONS.RECORD_AUDIO);
    default: {
      const status = getNativeControl()?.getStatus();
      if (!status) return null;
      return {
        accessibility: status.accessibilityEnabled,
        overlay: status.overlayPermission,
        media_access: status.mediaAccess,
        write_settings: status.writeSettings,
      }[step];
    }
  }
}

/**
 * Asks for an access: the runtime permission dialog for the camera and the
 * microphone, the system settings screen for the special accesses. Returns
 * the new state for the dialogs and null for settings screens, which answer
 * when the user comes back.
 */
export async function requestAccess(step: AccessStep): Promise<boolean | null> {
  if (Platform.OS !== 'android') {
    return null;
  }
  const { PERMISSIONS, RESULTS } = PermissionsAndroid;
  if (step === 'camera') {
    return (await requestControlPermissions({ microphone: false })).camera;
  }
  if (step === 'microphone') {
    return (await PermissionsAndroid.request(PERMISSIONS.RECORD_AUDIO)) === RESULTS.GRANTED;
  }
  const native = getNativeControl();
  if (!native) return null;
  switch (step) {
    case 'accessibility':
      native.openAccessibilitySettings();
      break;
    case 'overlay':
      native.openOverlaySettings();
      break;
    case 'media_access':
      native.openMediaAccessSettings();
      break;
    case 'write_settings':
      native.openWriteSettings();
      break;
  }
  return null;
}

/** True when Android 13 or later will block the accessibility service until restricted settings are allowed. */
export function needsRestrictedSettings(): boolean {
  try {
    return getNativeControl()?.getInstallSource().restrictedSettings === true;
  } catch {
    return false;
  }
}

/** True when this build can ask for the special accesses (the Android native module is in it). */
export function canAskForAccess(step: AccessStep): boolean {
  if (Platform.OS !== 'android') return false;
  return step === 'camera' || step === 'microphone' || getNativeControl() !== null;
}
