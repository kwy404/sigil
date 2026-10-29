import { useCallback, useSyncExternalStore } from 'react';

import type { OnDeviceModel, OnDeviceModelSnapshot } from '../adapters/model';
import { getOnDeviceModel } from '../adapters/model/platform';

/** The app wide on device model and its current state; re-renders on every change, download progress included. */
export function useOnDeviceModel(): { model: OnDeviceModel; snapshot: OnDeviceModelSnapshot } {
  const model = getOnDeviceModel();
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const read = useCallback(() => model.snapshot(), [model]);
  const snapshot = useSyncExternalStore(subscribe, read, read);
  return { model, snapshot };
}

