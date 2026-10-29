import { describe, expect, it } from '@jest/globals';

import { ProfileRegistry } from '../../app-profiles';
import { ActionPlanner } from '../../sigil-core';
import { fileUrl, findAsset, findTier, languageModelOf, MODEL_TIERS, ramClassMb } from '../catalog';
import { OnDeviceModel, PLANNER_TIMEOUT_MS, type ModelSettings, type OnDeviceModelDeps, type SettingsStore } from '../model';
import { CELLULAR, FakeLlama, FakeNetwork, flush, MemoryStorage, toolCallResult } from './fakes';

const GB = 1024 ** 3;
const profiles = ProfileRegistry.withBuiltins();

class MemorySettings implements SettingsStore {
  saved: Partial<ModelSettings> | null = null;

  load(): Partial<ModelSettings> | null {
    return this.saved;
  }

  save(settings: ModelSettings): void {
    this.saved = { ...settings };
  }
}

interface Rig {
  model: OnDeviceModel;
  storage: MemoryStorage;
  network: FakeNetwork;
  runtime: FakeLlama;
  settings: MemorySettings;
}

function rig(totalGb: number | null, overrides: Partial<OnDeviceModelDeps> = {}, settings = new MemorySettings()): Rig {
  const storage = new MemoryStorage();
  const network = new FakeNetwork();
  const runtime = new FakeLlama();
  const model = new OnDeviceModel({
    device: { totalMemoryBytes: totalGb === null ? null : totalGb * GB, cpuCores: 8 },
    storage,
    network,
    runtime,
    settings,
    supported: true,
    idleReleaseMs: 0,
    ...overrides,
  });
  return { model, storage, network, runtime, settings };
}

/** Downloads the model of the tier in use through the fake transfer. */
async function install({ model, storage }: Rig): Promise<void> {
  const asset = languageModelOf(findTier(model.snapshot().tier));
  if (!asset?.file) throw new Error('This tier has no model to download');
  storage.served = { size: asset.file.sizeBytes, sha: asset.file.sha256 };
  const done = model.download();
  await flush(10);
  storage.lastTransfer.finish();
  await done;
}

describe('model catalog for the on device model', () => {
  it('pins the official Qwen2.5 GGUF files by commit, size and SHA-256', () => {
    const lite = languageModelOf(findTier('lite'));
    const full = languageModelOf(findTier('full'));
    expect(languageModelOf(findTier('rules'))).toBeNull();
    expect(lite?.file).toEqual({
      repo: 'Qwen/Qwen2.5-1.5B-Instruct-GGUF',
      revision: '91cad51170dc346986eccefdc2dd33a9da36ead9',
      file: 'qwen2.5-1.5b-instruct-q4_k_m.gguf',
      sizeBytes: 1_117_320_736,
      sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
      license: 'Apache-2.0',
    });
    expect(full?.file).toMatchObject({
      repo: 'Qwen/Qwen2.5-3B-Instruct-GGUF',
      revision: '7dabda4d13d513e3e842b20f0d435c732f172cbe',
      file: 'qwen2.5-3b-instruct-q4_k_m.gguf',
      sizeBytes: 2_104_932_768,
      sha256: '626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d',
    });
    expect(fileUrl(lite!.file!)).toBe(
      'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/91cad51170dc346986eccefdc2dd33a9da36ead9/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    );
    for (const asset of [lite!, full!]) {
      expect(asset.file!.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(asset.file!.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(asset.downloadMb).toBe(Math.round(asset.file!.sizeBytes / 1024 ** 2));
      expect(findAsset(asset.id)).toBe(asset);
    }
  });

  it('rounds the memory the phone reports up to the size it was sold with', () => {
    expect(ramClassMb(1.8 * GB)).toBe(2048);
    expect(ramClassMb(2.7 * GB)).toBe(3072);
    expect(ramClassMb(3.6 * GB)).toBe(4096);
    expect(ramClassMb(5.5 * GB)).toBe(6144);
    expect(ramClassMb(7.3 * GB)).toBe(8192);
    expect(ramClassMb(8 * GB)).toBe(8192);
    expect(ramClassMb(11.2 * GB)).toBe(12288);
    expect(ramClassMb(15.4 * GB)).toBe(16384);
    expect(ramClassMb(40 * GB)).toBe(40960);
  });
});

describe('OnDeviceModel', () => {
  it('recommends the tier from the RAM expo-device reports', () => {
    expect(rig(3.6).model.snapshot()).toMatchObject({ recommended: 'rules', tier: 'rules', ramClassMb: 4096, choice: 'auto' });
    expect(rig(5.5).model.snapshot()).toMatchObject({ recommended: 'lite', tier: 'lite', ramClassMb: 6144 });
    expect(rig(7.3).model.snapshot()).toMatchObject({ recommended: 'full', tier: 'full', ramClassMb: 8192 });
    expect(rig(null).model.snapshot()).toMatchObject({ recommended: 'rules', ramClassMb: null });

    const options = rig(5.5).model.snapshot().options;
    expect(options.map((o) => [o.tier.id, o.fits, o.downloadBytes])).toEqual([
      ['rules', true, 0],
      ['lite', true, 1_117_320_736],
      ['full', false, 2_104_932_768],
    ]);
    expect(options.every((o) => o.download.status === 'absent')).toBe(true);
    expect(MODEL_TIERS.map((t) => PLANNER_TIMEOUT_MS[t.id])).toEqual([4000, 6000, 9000]);
  });

  it('switches between the tiers the phone can hold and remembers the choice', () => {
    const settings = new MemorySettings();
    const { model } = rig(5.5, {}, settings);
    model.selectTier('full');
    expect(model.snapshot().tier).toBe('lite');
    model.selectTier('rules');
    expect(model.snapshot()).toMatchObject({ choice: 'rules', tier: 'rules' });
    expect(model.languageModel()).toBeNull();
    expect(model.plannerTimeoutMs()).toBe(4000);
    expect(settings.saved).toEqual({ tier: 'rules', allowCellular: false });

    expect(rig(5.5, {}, settings).model.snapshot()).toMatchObject({ choice: 'rules', tier: 'rules' });
    settings.saved = { tier: 'full', allowCellular: true };
    expect(rig(5.5, {}, settings).model.snapshot()).toMatchObject({ choice: 'auto', tier: 'lite', allowCellular: true });
  });

  it('downloads the model of the tier in use over Wi-Fi, and over mobile data only when allowed', async () => {
    const r = rig(5.5);
    r.network.link = CELLULAR;
    await r.model.download();
    expect(r.model.snapshot().options[1].download).toMatchObject({ status: 'failed', error: 'wifi_required' });
    expect(r.storage.transfers).toHaveLength(0);

    r.model.setAllowCellular(true);
    await flush(10);
    expect(r.model.snapshot().options[1].download).toMatchObject({ status: 'downloading', bytes: 0, total: 1_117_320_736 });
    expect(r.storage.lastTransfer.url).toBe(fileUrl(languageModelOf(findTier('lite'))!.file!));
    r.storage.served = { size: 1_117_320_736, sha: languageModelOf(findTier('lite'))!.file!.sha256 };
    r.storage.lastTransfer.finish();
    await flush(10);
    expect(r.model.snapshot().options[1].download).toMatchObject({ status: 'ready' });
  });

  it('plans with the rules until the model is downloaded and loaded, then with the model', async () => {
    const r = rig(5.5);
    r.runtime.reply = toolCallResult('volume', { action: 'set', level: 30 });
    const planner = () => new ActionPlanner({ profiles, model: r.model.languageModel(), modelTimeoutMs: r.model.plannerTimeoutMs() });

    const before = await planner().plan({ text: 'set the volume to 30 percent' });
    expect(before.status === 'planned' && before.plan.source).toBe('rules');
    expect(r.runtime.inits).toHaveLength(0);

    await install(r);
    expect(r.model.snapshot().engine).toBe('none');
    const first = await planner().plan({ text: 'set the volume to 30 percent' });
    expect(first.status === 'planned' && first.plan.source).toBe('rules');
    await flush(20);
    expect(r.runtime.inits).toHaveLength(1);
    expect(r.runtime.inits[0]).toMatchObject({ model: 'file:///data/models/qwen2.5-1.5b-instruct-q4_k_m.gguf', n_ctx: 2048, n_threads: 4 });
    expect(r.model.snapshot().engine).toBe('ready');

    const second = await planner().plan({ text: 'deixa o volume em trinta por cento', locale: 'pt-BR' });
    expect(second.status === 'planned' && second.plan.source).toBe('model');
    expect(second.status === 'planned' && second.plan.steps).toEqual([{ kind: 'volume', stream: 'media', action: 'set', level: 30 }]);
  });

  it('falls back to the rules when the model is too slow, and stops it', async () => {
    const r = rig(5.5);
    await install(r);
    r.model.languageModel()!.prepare!({ locale: 'en-US', foregroundApp: null, knownApps: [] }, []);
    await flush(20);
    r.runtime.reply = (_params, context) => context.hang();
    const outcome = await new ActionPlanner({ profiles, model: r.model.languageModel(), modelTimeoutMs: 25 }).plan({ text: 'go home' });
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('rules');
    expect(outcome.status === 'planned' && outcome.notes).toEqual(['Model unavailable: no answer after 25 ms']);
    await flush(20);
    expect(r.runtime.lastContext.stops).toBe(1);
  });

  it('falls back to the rules when the model calls a tool that does not exist', async () => {
    const r = rig(5.5);
    await install(r);
    r.model.languageModel()!.prepare!({ locale: 'en-US', foregroundApp: null, knownApps: [] }, []);
    await flush(20);
    r.runtime.reply = { text: '{"name": "delete_everything", "arguments": {}}' };
    const outcome = await new ActionPlanner({ profiles, model: r.model.languageModel() }).plan({ text: 'open YouTube' });
    expect(outcome.status === 'planned' && outcome.plan.source).toBe('rules');
    expect(outcome.status === 'planned' && outcome.notes).toEqual(['Model answer rejected: Unknown tool "delete_everything".']);
  });

  it('releases the weights under memory pressure and before deleting the model', async () => {
    const r = rig(5.5);
    await install(r);
    r.model.languageModel()!.prepare!({ locale: 'en-US', foregroundApp: null, knownApps: [] }, []);
    await flush(20);
    const first = r.runtime.lastContext;
    await r.model.release();
    expect(first.released).toBe(true);
    expect(r.model.snapshot().engine).toBe('idle');
    expect(r.model.languageModel()!.isReady()).toBe(false);

    await r.model.deleteModel();
    expect(r.model.snapshot().options[1].download).toEqual({ status: 'absent' });
    expect(r.storage.size('file:///data/models/qwen2.5-1.5b-instruct-q4_k_m.gguf')).toBeNull();
    expect(r.model.snapshot().engine).toBe('none');
  });

  it('pauses the download of a tier the user leaves', async () => {
    const r = rig(7.3);
    r.model.selectTier('lite');
    const running = r.model.download();
    await flush(10);
    r.storage.lastTransfer.receive(5_000_000);
    r.model.selectTier('full');
    await running;
    expect(r.model.snapshot().options[1].download).toEqual({ status: 'paused', bytes: 5_000_000, total: 1_117_320_736, reason: 'user' });
    expect(r.model.snapshot().tier).toBe('full');
  });

  it('frees the weights of the old tier when the user switches tiers', async () => {
    const r = rig(7.3);
    r.model.selectTier('lite');
    await install(r);
    r.model.languageModel()!.prepare!({ locale: 'en-US', foregroundApp: null, knownApps: [] }, []);
    await flush(20);
    r.model.selectTier('full');
    await flush(20);
    expect(r.runtime.lastContext.released).toBe(true);
    expect(r.model.snapshot()).toMatchObject({ tier: 'full', engine: 'none' });
    expect(r.model.snapshot().options[1].download.status).toBe('ready');
  });

  it('stays on the rules where the runtime is missing', async () => {
    const r = rig(7.3, { supported: false });
    expect(r.model.snapshot().supported).toBe(false);
    expect(r.model.languageModel()).toBeNull();
    await r.model.download();
    expect(r.storage.transfers).toHaveLength(0);
  });
});
