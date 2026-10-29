import type { LanguageModel } from '../../sigil-core/model';
import {
  fileUrl,
  findTier,
  footprint,
  languageModelOf,
  MODEL_TIERS,
  ramClassMb,
  recommendTier,
  type ModelAsset,
  type ModelTier,
  type TierId,
} from '../catalog';
import { ModelDownloader, type DownloadState, type ModelStorage, type NetworkPort } from './downloader';
import { LlamaChatEngine, threadCountFor, type EngineStatus, type LlamaRuntime } from './llama-engine';
import { ToolCallingModel } from './tool-calling-model';

/** What Sigil knows about the phone. */
export interface DeviceInfo {
  /** Total RAM the system reports, in bytes (expo-device totalMemory), or null when unknown. */
  totalMemoryBytes: number | null;
  /** CPU cores, or null when unknown. */
  cpuCores: number | null;
}

export interface ModelSettings {
  /** auto follows the recommendation for the phone's memory. */
  tier: TierId | 'auto';
  /** Downloads use Wi-Fi only unless this is true. */
  allowCellular: boolean;
}

export const DEFAULT_MODEL_SETTINGS: ModelSettings = { tier: 'auto', allowCellular: false };

export interface SettingsStore {
  load(): Partial<ModelSettings> | null;
  save(settings: ModelSettings): void;
}

export interface OnDeviceModelDeps {
  device: DeviceInfo;
  storage: ModelStorage;
  network: NetworkPort;
  runtime: LlamaRuntime;
  settings: SettingsStore;
  /** False where no model can run: the web, or a build without the llama.rn native module. */
  supported: boolean;
  /** A reason to refuse loading the weights right now, for example low memory, or null. */
  memoryCheck?: () => string | null;
  /** Model layers on the GPU: Metal on iOS, 0 on Android. */
  gpuLayers?: number;
  idleReleaseMs?: number;
}

export interface TierOption {
  tier: ModelTier;
  /** The language model of the tier, or null for rules only. */
  model: ModelAsset | null;
  /** False when the phone has less memory than the tier needs; it cannot be selected. */
  fits: boolean;
  /** Download size of the language model in bytes, 0 for rules only. */
  downloadBytes: number;
  /** Peak memory of the tier in megabytes, speech and language models taking turns. */
  peakMemoryMb: number;
  download: DownloadState;
}

export interface OnDeviceModelSnapshot {
  supported: boolean;
  /** What expo-device reports, in bytes. */
  totalMemoryBytes: number | null;
  /** The memory the phone was sold with, in megabytes, as the tiers count it. */
  ramClassMb: number | null;
  recommended: TierId;
  choice: TierId | 'auto';
  /** The tier in use: the choice, or the recommendation for auto. */
  tier: TierId;
  allowCellular: boolean;
  options: TierOption[];
  /** State of the weights of the tier in use; none for rules only or before the download. */
  engine: EngineStatus | 'none';
  engineError: string | null;
}

/**
 * How long the planner waits for each tier before the rules answer. The
 * system prompt and the tools stay in the cache, so a request only evaluates
 * its own words and generates one short tool call; the 3B model generates
 * about half as fast as the 1.5B one on the same phone.
 */
export const PLANNER_TIMEOUT_MS: Record<TierId, number> = { rules: 4000, lite: 6000, full: 9000 };

/**
 * The on device language model as the app sees it: which tier the phone can
 * hold, the download of its model, and a LanguageModel for the planner that
 * runs llama.rn once the verified file is on the phone. Without a model the
 * planner uses the rule parser.
 */
export class OnDeviceModel {
  private readonly downloaders = new Map<string, ModelDownloader>();
  private readonly models = new Map<string, ToolCallingModel>();
  private engine: { assetId: string; engine: LlamaChatEngine } | null = null;
  private settings: ModelSettings;
  private readonly listeners = new Set<() => void>();
  private current: OnDeviceModelSnapshot;

  constructor(private readonly deps: OnDeviceModelDeps) {
    const saved = safely(() => deps.settings.load(), null);
    const tier = saved?.tier;
    this.settings = {
      tier: tier === 'auto' || MODEL_TIERS.some((t) => t.id === tier) ? (tier as TierId | 'auto') : DEFAULT_MODEL_SETTINGS.tier,
      allowCellular: saved?.allowCellular === true,
    };
    for (const tierEntry of MODEL_TIERS) {
      const model = languageModelOf(tierEntry);
      if (model?.file && !this.downloaders.has(model.id)) {
        const downloader = new ModelDownloader({
          file: model.file,
          url: fileUrl(model.file),
          storage: deps.storage,
          network: deps.network,
          allowCellular: () => this.settings.allowCellular,
          onChange: () => this.changed(),
        });
        this.downloaders.set(model.id, downloader);
        if (deps.supported) {
          downloader.restore();
        }
      }
    }
    if (this.settings.tier !== 'auto' && !this.fits(findTier(this.settings.tier))) {
      // A choice saved on a phone with more memory, for example after a restore.
      this.settings = { ...this.settings, tier: 'auto' };
    }
    this.current = this.build();
  }

  snapshot(): OnDeviceModelSnapshot {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * The LanguageModel of a tier (by default the one in use), or null for
   * rules only. It reports ready once the file is verified and the weights
   * are loaded; until then the planner uses the rules.
   */
  languageModel(tier: TierId = this.effectiveTier()): LanguageModel | null {
    const asset = languageModelOf(findTier(tier));
    if (!asset || !this.deps.supported) {
      return null;
    }
    let model = this.models.get(asset.id);
    if (!model) {
      model = new ToolCallingModel(asset.id, () => this.engineFor(asset));
      this.models.set(asset.id, model);
    }
    return model;
  }

  /** How long the planner waits for the model of a tier before the rules answer. */
  plannerTimeoutMs(tier: TierId = this.effectiveTier()): number {
    return PLANNER_TIMEOUT_MS[tier];
  }

  /**
   * Picks a tier, or auto to follow the recommendation. Tiers the phone cannot
   * hold are ignored. Leaving a tier frees its weights and pauses its download;
   * its files stay until the user deletes them.
   */
  selectTier(choice: TierId | 'auto'): void {
    if (choice !== 'auto' && !this.fits(findTier(choice))) {
      return;
    }
    const before = this.activeModel()?.id ?? null;
    this.settings = { ...this.settings, tier: choice };
    this.save();
    const after = this.activeModel()?.id ?? null;
    if (after !== before) {
      void this.dropEngine();
      for (const [id, downloader] of this.downloaders) {
        if (id !== after) void downloader.pause('user');
      }
    }
    this.changed();
  }

  setAllowCellular(allow: boolean): void {
    this.settings = { ...this.settings, allowCellular: allow };
    this.save();
    this.changed();
    for (const downloader of this.downloaders.values()) {
      void downloader.recheckNetwork();
    }
  }

  /** Downloads, or continues downloading, the model of the tier in use. Other downloads pause. */
  async download(): Promise<void> {
    const asset = this.activeModel();
    const downloader = asset ? this.downloaders.get(asset.id) : undefined;
    if (!asset || !downloader || !this.deps.supported) {
      return;
    }
    for (const [id, other] of this.downloaders) {
      if (id !== asset.id) await other.pause('user');
    }
    await downloader.start();
  }

  async pause(): Promise<void> {
    await this.activeDownloader()?.pause('user');
  }

  /** Stops the download of the tier in use and deletes the partial file. */
  cancel(): void {
    this.activeDownloader()?.cancel();
  }

  /** Releases the weights if they are loaded, then deletes the model file of the tier in use. */
  async deleteModel(): Promise<void> {
    const asset = this.activeModel();
    if (!asset) return;
    if (this.engine?.assetId === asset.id) {
      await this.dropEngine();
    }
    this.downloaders.get(asset.id)?.delete();
  }

  /**
   * Frees the weights and the cache, for example when the app goes to the
   * background or Android reports memory pressure. The next request loads
   * them again.
   */
  async release(): Promise<void> {
    await this.engine?.engine.release();
  }

  /** Stops network listeners and frees the weights. Partial downloads stay for the next start. */
  async dispose(): Promise<void> {
    for (const downloader of this.downloaders.values()) {
      downloader.dispose();
    }
    await this.dropEngine();
    this.listeners.clear();
  }

  private engineFor(asset: ModelAsset): LlamaChatEngine | null {
    const state = this.downloaders.get(asset.id)?.state;
    if (state?.status !== 'ready') {
      return null;
    }
    if (this.engine?.assetId === asset.id) {
      return this.engine.engine;
    }
    void this.dropEngine();
    const engine = new LlamaChatEngine({
      id: asset.id,
      modelPath: state.path,
      runtime: this.deps.runtime,
      threads: threadCountFor(this.deps.device.cpuCores),
      gpuLayers: this.deps.gpuLayers ?? 0,
      idleReleaseMs: this.deps.idleReleaseMs,
      canLoad: this.deps.memoryCheck,
      onStatus: () => this.changed(),
    });
    this.engine = { assetId: asset.id, engine };
    this.changed();
    return engine;
  }

  private async dropEngine(): Promise<void> {
    const current = this.engine;
    this.engine = null;
    if (current) {
      await current.engine.release();
      this.changed();
    }
  }

  private recommendedTier(): ModelTier {
    const ram = this.ramClass();
    return ram === null ? MODEL_TIERS[0] : recommendTier(ram);
  }

  private ramClass(): number | null {
    const total = this.deps.device.totalMemoryBytes;
    return total && total > 0 ? ramClassMb(total) : null;
  }

  private fits(tier: ModelTier): boolean {
    const ram = this.ramClass();
    return tier.id === 'rules' || (ram !== null && ram >= tier.minDeviceRamMb);
  }

  private effectiveTier(): TierId {
    const choice = this.settings.tier;
    return choice === 'auto' ? this.recommendedTier().id : choice;
  }

  private activeModel(): ModelAsset | null {
    return languageModelOf(findTier(this.effectiveTier()));
  }

  private activeDownloader(): ModelDownloader | undefined {
    const asset = this.activeModel();
    return asset ? this.downloaders.get(asset.id) : undefined;
  }

  private save(): void {
    safely(() => this.deps.settings.save(this.settings), undefined);
  }

  private build(): OnDeviceModelSnapshot {
    const tier = this.effectiveTier();
    const active = this.activeModel();
    const engine = active && this.engine?.assetId === active.id ? this.engine.engine : null;
    return {
      supported: this.deps.supported,
      totalMemoryBytes: this.deps.device.totalMemoryBytes,
      ramClassMb: this.ramClass(),
      recommended: this.recommendedTier().id,
      choice: this.settings.tier,
      tier,
      allowCellular: this.settings.allowCellular,
      options: MODEL_TIERS.map((entry) => {
        const model = languageModelOf(entry);
        return {
          tier: entry,
          model,
          fits: this.fits(entry),
          downloadBytes: model?.file?.sizeBytes ?? 0,
          peakMemoryMb: footprint(entry.assets).peakMemoryMb,
          download: (model && this.downloaders.get(model.id)?.state) || { status: 'absent' },
        };
      }),
      engine: engine ? engine.status : 'none',
      engineError: engine?.error ?? null,
    };
  }

  private changed(): void {
    this.current = this.build();
    for (const listener of [...this.listeners]) {
      listener();
    }
  }
}

function safely<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}
