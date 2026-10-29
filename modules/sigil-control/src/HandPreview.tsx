import { requireNativeView } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

import SigilControl from './SigilControlModule';

/**
 * The live front camera image with the hand landmarks drawn on top, from the
 * Android tracker. Null where the native module is missing (iOS, the web,
 * Expo Go), so callers can show something else.
 */
export const HandPreview: ComponentType<ViewProps> | null =
  Platform.OS === 'android' && SigilControl ? requireNativeView<ViewProps>('SigilControl') : null;
