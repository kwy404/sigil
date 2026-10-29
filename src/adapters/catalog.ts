/**
 * On device model candidates with their download and memory cost, in
 * megabytes of 1024 * 1024 bytes. Sizes of the candidates are rounded from the
 * published files. The language models Sigil downloads itself carry a pinned
 * file: repository, commit, exact size and SHA-256.
 */
export type AssetKind = 'vision' | 'stt' | 'llm';

/** One file on Hugging Face, pinned to a commit so the same URL always serves the same bytes. */
export interface PinnedFile {
  /** Repository that publishes the file, for example Qwen/Qwen2.5-1.5B-Instruct-GGUF. */
  repo: string;
  /** Full commit hash the download URL is pinned to. */
  revision: string;
  /** File name inside the repository. */
  file: string;
  /** Exact size in bytes. */
  sizeBytes: number;
  /** SHA-256 of the file, lowercase hex, as published by the repository. */
  sha256: string;
  /** License of the weights. */
  license: string;
}

export interface ModelAsset {
  id: string;
  kind: AssetKind;
  label: string;
  runtime: 'mediapipe' | 'platform' | 'whisper.rn' | 'llama.rn';
  /** Repository and file, or null for assets that ship with the OS or the app. */
  source: string | null;
  /** Download size in megabytes. */
  downloadMb: number;
  /** Resident memory while loaded, in megabytes, including runtime buffers. */
  memoryMb: number;
  notes: string;
  /** The exact file Sigil downloads, for the models the settings can install. */
  file?: PinnedFile;
}

/** The official download URL of a pinned file. */
export function fileUrl(file: PinnedFile): string {
  return `https://huggingface.co/${file.repo}/resolve/${file.revision}/${file.file}`;
}

export const MODEL_CATALOG: readonly ModelAsset[] = [
  {
    id: 'hand-landmarker',
    kind: 'vision',
    label: 'MediaPipe Hand Landmarker',
    runtime: 'mediapipe',
    source: 'MediaPipe hand_landmarker.task, bundled with the app',
    downloadMb: 8,
    memoryMb: 60,
    notes: '21 landmarks per hand, runs on the GPU delegate when available.',
  },
  {
    id: 'platform-stt',
    kind: 'stt',
    label: 'System speech recognizer',
    runtime: 'platform',
    source: null,
    downloadMb: 0,
    memoryMb: 0,
    notes: 'On device recognition where the phone offers it. Languages and offline support vary by device.',
  },
  {
    id: 'whisper-tiny-q5_1',
    kind: 'stt',
    label: 'Whisper tiny (q5_1)',
    runtime: 'whisper.rn',
    source: 'ggerganov/whisper.cpp ggml-tiny-q5_1.bin',
    downloadMb: 32,
    memoryMb: 120,
    notes: 'Fast, weak on accents and noise.',
  },
  {
    id: 'whisper-base-q5_1',
    kind: 'stt',
    label: 'Whisper base (q5_1)',
    runtime: 'whisper.rn',
    source: 'ggerganov/whisper.cpp ggml-base-q5_1.bin',
    downloadMb: 60,
    memoryMb: 200,
    notes: 'Good balance for short commands in English and Portuguese.',
  },
  {
    id: 'whisper-small-q5_1',
    kind: 'stt',
    label: 'Whisper small (q5_1)',
    runtime: 'whisper.rn',
    source: 'ggerganov/whisper.cpp ggml-small-q5_1.bin',
    downloadMb: 190,
    memoryMb: 500,
    notes: 'Best accuracy of the three, about three times slower than base.',
  },
  {
    id: 'llama-3.2-1b-q4_k_m',
    kind: 'llm',
    label: 'Llama 3.2 1B Instruct (Q4_K_M)',
    runtime: 'llama.rn',
    source: 'bartowski/Llama-3.2-1B-Instruct-GGUF Llama-3.2-1B-Instruct-Q4_K_M.gguf',
    downloadMb: 810,
    memoryMb: 1100,
    notes: 'Smallest useful tool caller. Needs the deterministic fallback more often.',
  },
  {
    id: 'qwen2.5-1.5b-q4_k_m',
    kind: 'llm',
    label: 'Qwen2.5 1.5B Instruct (Q4_K_M)',
    runtime: 'llama.rn',
    source: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF qwen2.5-1.5b-instruct-q4_k_m.gguf',
    downloadMb: 1066,
    memoryMb: 1350,
    notes: 'Reliable JSON tool calls for its size, good Portuguese.',
    file: {
      repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
      revision: '91cad51170dc346986eccefdc2dd33a9da36ead9',
      file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
      sizeBytes: 1_117_320_736,
      sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
      license: 'Apache-2.0',
    },
  },
  {
    id: 'qwen2.5-3b-q4_k_m',
    kind: 'llm',
    label: 'Qwen2.5 3B Instruct (Q4_K_M)',
    runtime: 'llama.rn',
    source: 'Qwen/Qwen2.5-3B-Instruct-GGUF qwen2.5-3b-instruct-q4_k_m.gguf',
    downloadMb: 2007,
    memoryMb: 2500,
    notes: 'Handles compound and indirect requests better. Flagship phones only.',
    file: {
      repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
      revision: '7dabda4d13d513e3e842b20f0d435c732f172cbe',
      file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
      sizeBytes: 2_104_932_768,
      sha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
      license: 'Qwen Research License (research and evaluation; commercial use needs a license from Alibaba Cloud)',
    },
  },
  {
    id: 'llama-3.2-3b-q4_k_m',
    kind: 'llm',
    label: 'Llama 3.2 3B Instruct (Q4_K_M)',
    runtime: 'llama.rn',
    source: 'bartowski/Llama-3.2-3B-Instruct-GGUF Llama-3.2-3B-Instruct-Q4_K_M.gguf',
    downloadMb: 2020,
    memoryMb: 2600,
    notes: 'Alternative to Qwen2.5 3B with a different license.',
  },
];

export type TierId = 'rules' | 'lite' | 'full';

export interface ModelTier {
  id: TierId;
  label: string;
  assets: readonly string[];
  /** Below this much device RAM the tier is never offered. */
  minDeviceRamMb: number;
}

export const MODEL_TIERS: readonly ModelTier[] = [
  { id: 'rules', label: 'Rules only', assets: ['hand-landmarker', 'platform-stt'], minDeviceRamMb: 3072 },
  { id: 'lite', label: 'Lite', assets: ['hand-landmarker', 'whisper-base-q5_1', 'qwen2.5-1.5b-q4_k_m'], minDeviceRamMb: 6144 },
  { id: 'full', label: 'Full', assets: ['hand-landmarker', 'whisper-small-q5_1', 'qwen2.5-3b-q4_k_m'], minDeviceRamMb: 8192 },
];

export interface Footprint {
  downloadMb: number;
  /** Memory when speech and language models take turns: Sigil unloads one before loading the other. */
  peakMemoryMb: number;
  /** Memory if every asset stayed loaded at once. */
  residentMemoryMb: number;
}

export function findAsset(id: string): ModelAsset | undefined {
  return MODEL_CATALOG.find((asset) => asset.id === id);
}

export function footprint(assetIds: readonly string[]): Footprint {
  const assets = assetIds.map((id) => {
    const asset = findAsset(id);
    if (!asset) {
      throw new Error(`Unknown model asset ${id}.`);
    }
    return asset;
  });
  const sum = (kind?: AssetKind) => assets.filter((a) => !kind || a.kind === kind).reduce((total, a) => total + a.memoryMb, 0);
  return {
    downloadMb: assets.reduce((total, a) => total + a.downloadMb, 0),
    peakMemoryMb: sum('vision') + Math.max(sum('stt'), sum('llm')),
    residentMemoryMb: sum(),
  };
}

/**
 * Largest tier the phone can hold. budgetShare is the part of the device RAM
 * Sigil allows itself; Android reclaims memory from big background apps, so
 * the default stays well below half.
 */
export function recommendTier(deviceRamMb: number, budgetShare = 0.35): ModelTier {
  let best = MODEL_TIERS[0];
  for (const tier of MODEL_TIERS) {
    if (deviceRamMb >= tier.minDeviceRamMb && footprint(tier.assets).peakMemoryMb <= deviceRamMb * budgetShare) {
      best = tier;
    }
  }
  return best;
}

export function findTier(id: TierId): ModelTier {
  const tier = MODEL_TIERS.find((t) => t.id === id);
  if (!tier) {
    throw new Error(`Unknown model tier ${id}.`);
  }
  return tier;
}

/** The language model a tier runs, or null for the rules only tier. */
export function languageModelOf(tier: ModelTier): ModelAsset | null {
  for (const id of tier.assets) {
    const asset = findAsset(id);
    if (asset?.kind === 'llm') {
      return asset;
    }
  }
  return null;
}

/** Memory sizes phones are sold with, in gigabytes. */
const RAM_CLASSES_GB = [1, 1.5, 2, 3, 4, 6, 8, 10, 12, 16, 18, 20, 24, 32];

/**
 * The memory a phone was sold with, in megabytes, from the total the system
 * reports (expo-device totalMemory, in bytes). Android keeps part of the RAM
 * for the kernel and the modem, so an 8 GB phone reports about 7.3 GB; the
 * tiers are defined on the sold size, so the report is rounded up to the next
 * common size.
 */
export function ramClassMb(totalMemoryBytes: number): number {
  const gb = totalMemoryBytes / 1024 ** 3;
  const size = RAM_CLASSES_GB.find((candidate) => gb <= candidate + 0.01) ?? Math.ceil(gb);
  return Math.round(size * 1024);
}
