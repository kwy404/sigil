import type { PinnedFile } from '../catalog';

/** Why a download stopped without a model. */
export type DownloadError =
  /** No network at all. */
  | 'offline'
  /** On mobile data while the download is set to Wi-Fi only. */
  | 'wifi_required'
  /** Not enough free storage for the rest of the file plus a reserve. */
  | 'no_space'
  /** The connection failed or the server refused; the partial file is kept. */
  | 'network'
  /** The file did not match its pinned size or SHA-256 and was deleted. */
  | 'checksum'
  /** The phone's storage refused a read, write or move. */
  | 'storage';

/** user: the pause button. network: Wi-Fi went away. interrupted: the app closed during the download. */
export type PauseReason = 'user' | 'network' | 'interrupted';

export type DownloadState =
  | { status: 'absent' }
  | { status: 'downloading'; bytes: number; total: number }
  | { status: 'paused'; bytes: number; total: number; reason: PauseReason }
  | { status: 'verifying'; total: number }
  | { status: 'ready'; path: string; total: number }
  | { status: 'failed'; error: DownloadError; bytes: number; total: number; detail?: string };

export interface NetworkInfo {
  connected: boolean;
  /** Wi-Fi or Ethernet. Mobile data, tethering and unknown links count as metered. */
  unmetered: boolean;
}

export interface NetworkPort {
  current(): Promise<NetworkInfo>;
  /** Calls the listener on every change; returns the unsubscribe function. */
  subscribe(listener: (info: NetworkInfo) => void): () => void;
}

/** One running HTTP transfer of the model file. */
export interface Transfer {
  /** Resolves done when the whole file is on disk and paused after pause(); rejects on errors and after cancel(). */
  run(): Promise<'done' | 'paused'>;
  /** Stops the transfer and keeps the partial file; resolves once run() has settled. */
  pause(): Promise<void>;
  /** Stops the transfer for good. */
  cancel(): void;
  /** While paused: what a later transfer needs to continue from here, or null. */
  resumeToken(): string | null;
}

/** File access the downloader needs. Paths are file URIs; the platform adapter maps them to expo-file-system. */
export interface ModelStorage {
  /** Location of a file in the model folder. */
  path(name: string): string;
  /** Size in bytes, or null when the file does not exist. */
  size(path: string): number | null;
  remove(path: string): void;
  /** Replaces the target if it exists. */
  move(from: string, to: string): void;
  readText(path: string): string | null;
  writeText(path: string, text: string): void;
  /** Lowercase hex SHA-256 of the file, computed off the JavaScript thread. */
  sha256(path: string): Promise<string>;
  /** Free bytes on the storage that holds the models, or null when unknown. */
  freeBytes(): number | null;
  /** A transfer of url into path; token continues a paused or interrupted one. */
  transfer(url: string, path: string, token: string | null, onProgress: (bytes: number) => void): Transfer;
  /**
   * A token that continues from the bytes already in the partial file, where
   * the platform can resume from a byte offset (Android). Null elsewhere.
   */
  tokenFromPartial(url: string, path: string, bytes: number): string | null;
}

export interface DownloaderOptions {
  file: PinnedFile;
  url: string;
  storage: ModelStorage;
  network: NetworkPort;
  /** Read on every start and network change; false means Wi-Fi only. */
  allowCellular: () => boolean;
  /** Storage to leave free on top of the file, so the phone keeps working. Defaults to 300 MB. */
  reserveBytes?: number;
  onChange?: (state: DownloadState) => void;
}

/** Free storage kept on top of the model file. */
export const DEFAULT_RESERVE_BYTES = 300 * 1024 * 1024;

interface PartialMeta {
  /** The pinned SHA-256 the partial file belongs to; a different pin starts over. */
  sha256: string;
  token: string | null;
}

/**
 * Downloads one pinned model file once: into a .part file, resumable after a
 * pause, a network change or an app restart, and verified against the pinned
 * size and SHA-256 before it becomes the model. A file that does not match is
 * deleted. Wi-Fi only unless the user allows mobile data, and only when the
 * storage can hold the rest of the file plus a reserve.
 *
 * Files: <name> (verified model), <name>.sha256 (marker written after the
 * check), <name>.part and <name>.part.json (partial download and its resume
 * token).
 */
export class ModelDownloader {
  private stateValue: DownloadState = { status: 'absent' };
  private transfer: Transfer | null = null;
  private pending: Promise<DownloadState> | null = null;
  private pauseReason: PauseReason | null = null;
  /** Bumped by cancel and delete, so work started before them stops touching the state. */
  private generation = 0;
  private unsubscribe: (() => void) | null = null;
  readonly finalPath: string;
  private readonly partPath: string;
  private readonly metaPath: string;
  private readonly markerPath: string;

  constructor(private readonly options: DownloaderOptions) {
    const { storage, file } = options;
    this.finalPath = storage.path(file.file);
    this.partPath = `${this.finalPath}.part`;
    this.metaPath = `${this.finalPath}.part.json`;
    this.markerPath = `${this.finalPath}.sha256`;
  }

  get state(): DownloadState {
    return this.stateValue;
  }

  private get total(): number {
    return this.options.file.sizeBytes;
  }

  /**
   * Reads what is on disk: a verified model, a partial download to resume,
   * or nothing. A complete file without its marker (the app closed during the
   * last step) goes back to being a partial file and is checked again on the
   * next start; anything else unexpected, such as a partial file of another
   * pin, is deleted.
   */
  restore(): DownloadState {
    const { storage, file } = this.options;
    try {
      const finalSize = storage.size(this.finalPath);
      const marker = storage.readText(this.markerPath)?.trim().toLowerCase() ?? null;
      if (finalSize === file.sizeBytes && marker === file.sha256) {
        return this.set({ status: 'ready', path: this.finalPath, total: this.total });
      }
      storage.remove(this.markerPath);
      if (finalSize === file.sizeBytes) {
        storage.remove(this.partPath);
        storage.move(this.finalPath, this.partPath);
        this.writeMeta({ sha256: file.sha256, token: null });
      } else if (finalSize !== null) {
        storage.remove(this.finalPath);
      }
      const partSize = storage.size(this.partPath);
      if (partSize === null) {
        storage.remove(this.metaPath);
        return this.set({ status: 'absent' });
      }
      const meta = this.readMeta();
      if (!meta || meta.sha256 !== file.sha256 || partSize > file.sizeBytes) {
        this.removePartial();
        return this.set({ status: 'absent' });
      }
      return this.set({ status: 'paused', bytes: partSize, total: this.total, reason: 'interrupted' });
    } catch (error) {
      return this.set({ status: 'failed', error: 'storage', bytes: 0, total: this.total, detail: describe(error) });
    }
  }

  /**
   * Starts the download, or continues a paused or failed one. Resolves with
   * the state it ended in: ready, paused, failed, or absent after a cancel.
   * Calling it again while it runs returns the same promise.
   */
  start(): Promise<DownloadState> {
    this.pending ??= this.run().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  /** Pauses a running download and keeps the partial file. */
  async pause(reason: PauseReason = 'user'): Promise<void> {
    if (this.stateValue.status !== 'downloading' || !this.transfer) return;
    this.pauseReason = reason;
    await this.transfer.pause();
  }

  /** Stops the download and deletes the partial file. A verified model stays. */
  cancel(): DownloadState {
    this.generation++;
    if (this.transfer) {
      this.transfer.cancel();
      this.transfer = null;
    }
    if (this.stateValue.status === 'ready') {
      return this.stateValue;
    }
    this.stopWatchingNetwork();
    try {
      this.removePartial();
    } catch {
      // The next restore cleans up what could not be deleted now.
    }
    return this.set({ status: 'absent' });
  }

  /** Deletes the model, its marker and any partial download. */
  delete(): DownloadState {
    this.cancel();
    this.stopWatchingNetwork();
    const { storage } = this.options;
    try {
      storage.remove(this.finalPath);
      storage.remove(this.markerPath);
    } catch (error) {
      return this.set({ status: 'failed', error: 'storage', bytes: 0, total: this.total, detail: describe(error) });
    }
    return this.set({ status: 'absent' });
  }

  /**
   * Applies the network rules again, for example after the user allowed
   * mobile data: pauses a download on a link it may not use, and continues
   * one that stopped because of the network when the link is fine again.
   */
  async recheckNetwork(): Promise<void> {
    this.onNetwork(await this.options.network.current());
  }

  /** Stops listening to the network. The partial file stays for the next start. */
  dispose(): void {
    this.stopWatchingNetwork();
  }

  private async run(): Promise<DownloadState> {
    const status = this.stateValue.status;
    if (status === 'downloading' || status === 'verifying' || status === 'ready') {
      return this.stateValue;
    }
    const { storage, network, file } = this.options;
    const generation = this.generation;
    let partial = this.partialBytes();
    if (partial === file.sizeBytes) {
      // Every byte is on the phone: the app closed before the check finished.
      return this.verify(generation);
    }
    this.watchNetwork();

    const link = await network.current();
    if (generation !== this.generation) {
      return this.stateValue;
    }
    if (!link.connected) {
      return this.set({ status: 'failed', error: 'offline', bytes: partial, total: this.total });
    }
    if (!link.unmetered && !this.options.allowCellular()) {
      return this.set({ status: 'failed', error: 'wifi_required', bytes: partial, total: this.total });
    }
    const free = storage.freeBytes();
    const reserve = this.options.reserveBytes ?? DEFAULT_RESERVE_BYTES;
    if (free !== null && free < file.sizeBytes - partial + reserve) {
      return this.set({ status: 'failed', error: 'no_space', bytes: partial, total: this.total });
    }

    let token: string | null = null;
    try {
      token = partial > 0 ? (this.readMeta()?.token ?? storage.tokenFromPartial(this.options.url, this.partPath, partial)) : null;
      if (partial > 0 && token === null) {
        // This platform cannot continue from a byte offset: start over.
        this.removePartial();
        partial = 0;
      }
      this.writeMeta({ sha256: file.sha256, token: null });
    } catch (error) {
      return this.set({ status: 'failed', error: 'storage', bytes: partial, total: this.total, detail: describe(error) });
    }

    this.pauseReason = null;
    this.set({ status: 'downloading', bytes: partial, total: this.total });
    const transfer = storage.transfer(this.options.url, this.partPath, token, (bytes) => {
      if (this.transfer === transfer && this.stateValue.status === 'downloading') {
        this.set({ status: 'downloading', bytes: Math.min(bytes, this.total), total: this.total });
      }
    });
    this.transfer = transfer;
    try {
      const outcome = await transfer.run();
      if (generation !== this.generation) {
        return this.stateValue;
      }
      if (outcome === 'paused') {
        this.writeMeta({ sha256: file.sha256, token: transfer.resumeToken() });
        // pause() set the reason while run() was waiting for the transfer.
        const reason: PauseReason = (this.pauseReason as PauseReason | null) ?? 'user';
        const paused = this.set({ status: 'paused', bytes: this.partialBytes(), total: this.total, reason });
        if (reason === 'network') {
          // The link may have come back while the transfer was stopping.
          void this.recheckNetwork();
        }
        return paused;
      }
    } catch (error) {
      if (generation !== this.generation) {
        return this.stateValue;
      }
      return this.set({ status: 'failed', error: 'network', bytes: this.partialBytes(), total: this.total, detail: describe(error) });
    } finally {
      if (this.transfer === transfer) {
        this.transfer = null;
      }
    }
    return this.verify(generation);
  }

  private onNetwork(link: NetworkInfo): void {
    const allowed = link.connected && (link.unmetered || this.options.allowCellular());
    const state = this.stateValue;
    if (state.status === 'downloading' && !allowed) {
      void this.pause('network');
    } else if (allowed && this.stoppedByNetwork(state)) {
      void this.start();
    }
  }

  private stoppedByNetwork(state: DownloadState): boolean {
    if (state.status === 'paused') return state.reason === 'network';
    if (state.status === 'failed') return state.error === 'offline' || state.error === 'wifi_required' || state.error === 'network';
    return false;
  }

  private async verify(generation: number): Promise<DownloadState> {
    const { storage, file } = this.options;
    this.set({ status: 'verifying', total: this.total });
    try {
      const size = storage.size(this.partPath);
      const digest = size === file.sizeBytes ? (await storage.sha256(this.partPath)).toLowerCase() : null;
      if (generation !== this.generation) {
        return this.stateValue;
      }
      if (digest !== file.sha256) {
        this.removePartial();
        const detail = digest === null ? `size ${size ?? 0} instead of ${file.sizeBytes}` : `sha256 ${digest}`;
        return this.set({ status: 'failed', error: 'checksum', bytes: 0, total: this.total, detail });
      }
      storage.move(this.partPath, this.finalPath);
      storage.writeText(this.markerPath, file.sha256);
      storage.remove(this.metaPath);
    } catch (error) {
      if (generation !== this.generation) {
        return this.stateValue;
      }
      return this.set({ status: 'failed', error: 'storage', bytes: this.partialBytes(), total: this.total, detail: describe(error) });
    }
    this.stopWatchingNetwork();
    return this.set({ status: 'ready', path: this.finalPath, total: this.total });
  }

  private partialBytes(): number {
    try {
      return this.options.storage.size(this.partPath) ?? 0;
    } catch {
      return 0;
    }
  }

  private readMeta(): PartialMeta | null {
    try {
      const text = this.options.storage.readText(this.metaPath);
      const meta = text ? (JSON.parse(text) as Partial<PartialMeta>) : null;
      return meta && typeof meta.sha256 === 'string' ? { sha256: meta.sha256, token: typeof meta.token === 'string' ? meta.token : null } : null;
    } catch {
      return null;
    }
  }

  private writeMeta(meta: PartialMeta): void {
    this.options.storage.writeText(this.metaPath, JSON.stringify(meta));
  }

  private removePartial(): void {
    this.options.storage.remove(this.partPath);
    this.options.storage.remove(this.metaPath);
  }

  private watchNetwork(): void {
    this.unsubscribe ??= this.options.network.subscribe((link) => this.onNetwork(link));
  }

  private stopWatchingNetwork(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private set(state: DownloadState): DownloadState {
    this.stateValue = state;
    this.options.onChange?.(state);
    return state;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
