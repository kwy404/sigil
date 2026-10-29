import * as Device from 'expo-device';
import { Directory, DownloadTask, File, Paths, type DownloadPauseState, type DownloadTaskOptions } from 'expo-file-system';
import * as Network from 'expo-network';
import { AppState, Platform, TurboModuleRegistry } from 'react-native';

import SigilMemory from '../../../modules/sigil-memory';
import type { ModelStorage, NetworkInfo, NetworkPort, Transfer } from './downloader';
import { llamaRnRuntime } from './llama-engine';
import { OnDeviceModel, type DeviceInfo, type ModelSettings, type SettingsStore } from './on-device';

/**
 * The platform side of the on device model: expo-file-system for the files
 * and the download, expo-network for the Wi-Fi rule, expo-device for the RAM,
 * the sigil-memory module for the cores and memory pressure, and llama.rn.
 * Unit tests use the ports in downloader.ts and llama-engine.ts instead.
 */

const MODELS_FOLDER = 'models';
const SETTINGS_FILE = 'sigil-model.json';

/** ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW: Android runs low on memory while Sigil is visible. */
const TRIM_MEMORY_RUNNING_LOW = 10;

function modelsFolder(): Directory {
  const folder = new Directory(Paths.document, MODELS_FOLDER);
  if (!folder.exists) {
    folder.create({ intermediates: true, idempotent: true });
  }
  return folder;
}

class ExpoTransfer implements Transfer {
  private readonly task: DownloadTask;

  constructor(url: string, path: string, token: string | null, onProgress: (bytes: number) => void) {
    const options: DownloadTaskOptions = { onProgress: (progress) => onProgress(progress.bytesWritten) };
    const saved = token ? (JSON.parse(token) as DownloadPauseState) : null;
    this.task = saved ? DownloadTask.fromSavable(saved, options) : new DownloadTask(url, new File(path), options);
  }

  async run(): Promise<'done' | 'paused'> {
    try {
      const file = this.task.state === 'paused' ? await this.task.resumeAsync() : await this.task.downloadAsync();
      return file ? 'done' : 'paused';
    } finally {
      if (this.task.state !== 'paused') {
        this.task.release();
      }
    }
  }

  async pause(): Promise<void> {
    if (this.task.state === 'active') {
      await this.task.pauseAsync();
    }
  }

  cancel(): void {
    this.task.cancel();
  }

  resumeToken(): string | null {
    return this.task.state === 'paused' ? JSON.stringify(this.task.savable()) : null;
  }
}

/** Model files in the app's document folder, under models/. Android backups are off for Sigil (app.json). */
export function expoModelStorage(): ModelStorage {
  return {
    path: (name) => new File(modelsFolder(), name).uri,
    size: (path) => {
      const file = new File(path);
      return file.exists ? file.size : null;
    },
    remove: (path) => {
      const file = new File(path);
      if (file.exists) file.delete();
    },
    move: (from, to) => {
      const target = new File(to);
      if (target.exists) target.delete();
      new File(from).moveSync(target);
    },
    readText: (path) => {
      const file = new File(path);
      return file.exists ? file.textSync() : null;
    },
    writeText: (path, text) => new File(path).writeSync(text),
    sha256: (path) => new File(path).digest('SHA-256'),
    freeBytes: () => {
      try {
        return Paths.availableDiskSpace;
      } catch {
        return null;
      }
    },
    transfer: (url, path, token, onProgress) => new ExpoTransfer(url, path, token, onProgress),
    // On Android the resume data of a paused transfer is the byte offset, so
    // a download the system stopped continues from the partial file.
    tokenFromPartial: (url, path, bytes) =>
      Platform.OS === 'android'
        ? JSON.stringify({ url, fileUri: path, isDirectory: false, resumeData: String(bytes) } satisfies DownloadPauseState)
        : null,
  };
}

/** Storage for builds that cannot run a model (the web, Expo Go): nothing is ever read or written. */
function unavailableStorage(): ModelStorage {
  const refuse = (): never => {
    throw new Error('This build cannot store models.');
  };
  return {
    path: (name) => `${MODELS_FOLDER}/${name}`,
    size: () => null,
    remove: () => undefined,
    move: refuse,
    readText: () => null,
    writeText: refuse,
    sha256: refuse,
    freeBytes: () => null,
    transfer: refuse,
    tokenFromPartial: () => null,
  };
}

function toNetworkInfo(state: Network.NetworkState): NetworkInfo {
  const type = state.type ?? Network.NetworkStateType.UNKNOWN;
  return {
    connected: state.isConnected === true && type !== Network.NetworkStateType.NONE,
    unmetered: type === Network.NetworkStateType.WIFI || type === Network.NetworkStateType.ETHERNET,
  };
}

export function expoNetwork(): NetworkPort {
  return {
    current: async () => toNetworkInfo(await Network.getNetworkStateAsync()),
    subscribe: (listener) => {
      const subscription = Network.addNetworkStateListener((state) => listener(toNetworkInfo(state)));
      return () => subscription.remove();
    },
  };
}

function settingsStore(): SettingsStore {
  const file = () => new File(Paths.document, SETTINGS_FILE);
  return {
    load: () => {
      const saved = file();
      return saved.exists ? (JSON.parse(saved.textSync()) as Partial<ModelSettings>) : null;
    },
    save: (settings) => file().writeSync(JSON.stringify(settings)),
  };
}

function deviceInfo(): DeviceInfo {
  let cpuCores: number | null = null;
  try {
    cpuCores = SigilMemory?.cpuCores() ?? null;
  } catch {
    cpuCores = null;
  }
  return { totalMemoryBytes: Device.totalMemory ?? null, cpuCores };
}

function memoryCheck(): string | null {
  try {
    return SigilMemory?.memoryInfo().lowMemory ? 'The phone is low on memory.' : null;
  } catch {
    return null;
  }
}

/** llama.rn is a native module: absent on the web and in Expo Go, where Sigil keeps to the rules. */
function runtimeAvailable(): boolean {
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    return TurboModuleRegistry.get('RNLlama') != null;
  } catch {
    return false;
  }
}

/** Releases the weights when the app goes to the background or the system asks for memory. */
function releaseOnPressure(model: OnDeviceModel): void {
  AppState.addEventListener('change', (state) => {
    if (state === 'background') void model.release();
  });
  // iOS memory warnings. React Native does not forward them on Android, where sigil-memory does.
  AppState.addEventListener('memoryWarning', () => void model.release());
  SigilMemory?.addListener('onMemoryPressure', (event) => {
    if (event.level >= TRIM_MEMORY_RUNNING_LOW) void model.release();
  });
}

let shared: OnDeviceModel | null = null;

/** The app wide on device model. Created on first use; restores downloads and settings from the phone. */
export function getOnDeviceModel(): OnDeviceModel {
  if (!shared) {
    const supported = runtimeAvailable();
    shared = new OnDeviceModel({
      device: deviceInfo(),
      storage: supported ? expoModelStorage() : unavailableStorage(),
      network: expoNetwork(),
      runtime: llamaRnRuntime(),
      settings: settingsStore(),
      supported,
      memoryCheck,
      gpuLayers: Platform.OS === 'ios' ? 99 : 0,
    });
    if (supported) {
      releaseOnPressure(shared);
    }
  }
  return shared;
}
