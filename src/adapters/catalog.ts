/**
 * On device model candidates with their download and memory cost. Sizes are
 * approximate (rounded from the published files) and must be pinned, together
 * with a SHA-256 and a repository revision, when the download manager lands.
 */
export type AssetKind = 'vision' | 'stt' | 'llm';

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
    downloadMb: 1000,
    memoryMb: 1350,
    notes: 'Reliable JSON tool calls for its size, good Portuguese.',
  },
  {
    id: 'qwen2.5-3b-q4_k_m',
    kind: 'llm',
    label: 'Qwen2.5 3B Instruct (Q4_K_M)',
    runtime: 'llama.rn',
    source: 'Qwen/Qwen2.5-3B-Instruct-GGUF qwen2.5-3b-instruct-q4_k_m.gguf',
    downloadMb: 1950,
    memoryMb: 2500,
    notes: 'Handles compound and indirect requests better. Flagship phones only.',
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
