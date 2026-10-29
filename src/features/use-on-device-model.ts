import { useCallback, useSyncExternalStore } from 'react';

import type { TierId } from '../adapters/catalog';
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

/** The on device model and the tier in use; re-renders only when the tier changes, not on download progress. */
export function useOnDeviceTier(): { model: OnDeviceModel; tier: TierId } {
  const model = getOnDeviceModel();
  const subscribe = useCallback((listener: () => void) => model.subscribe(listener), [model]);
  const read = useCallback(() => model.snapshot().tier, [model]);
  const tier = useSyncExternalStore(subscribe, read, read);
  return { model, tier };
}
