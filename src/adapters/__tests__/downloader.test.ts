import { beforeEach, describe, expect, it } from '@jest/globals';

import type { PinnedFile } from '../catalog';
import { ModelDownloader, type DownloadState } from '../model';
import { CELLULAR, FakeNetwork, flush, MemoryStorage, OFFLINE, WIFI } from './fakes';

const SHA = 'a'.repeat(64);
const FILE: PinnedFile = {
  repo: 'Qwen/Test-GGUF',
  revision: '0123456789abcdef0123456789abcdef01234567',
  file: 'test-q4_k_m.gguf',
  sizeBytes: 1000,
  sha256: SHA,
  license: 'Apache-2.0',
};
const URL = 'https://huggingface.co/Qwen/Test-GGUF/resolve/0123456789abcdef0123456789abcdef01234567/test-q4_k_m.gguf';
const FINAL = 'file:///data/models/test-q4_k_m.gguf';
const PART = `${FINAL}.part`;
const META = `${FINAL}.part.json`;
const MARKER = `${FINAL}.sha256`;

let storage: MemoryStorage;
let network: FakeNetwork;
let allowCellular: boolean;
let states: DownloadState[];

function downloader(reserveBytes = 0): ModelDownloader {
  return new ModelDownloader({
    file: FILE,
    url: URL,
    storage,
    network,
    allowCellular: () => allowCellular,
    reserveBytes,
    onChange: (state) => states.push(state),
  });
}

beforeEach(() => {
  storage = new MemoryStorage();
  storage.served = { size: FILE.sizeBytes, sha: SHA };
  network = new FakeNetwork(WIFI);
  allowCellular = false;
  states = [];
});

describe('ModelDownloader', () => {
  it('downloads once with progress and verifies the SHA-256 before the model is ready', async () => {
    const d = downloader();
    expect(d.restore()).toEqual({ status: 'absent' });
    const done = d.start();
    await flush();
    expect(d.state).toEqual({ status: 'downloading', bytes: 0, total: 1000 });
    const transfer = storage.lastTransfer;
    expect(transfer.url).toBe(URL);
    expect(transfer.path).toBe(PART);
    transfer.receive(400);
    expect(d.state).toEqual({ status: 'downloading', bytes: 400, total: 1000 });
    transfer.finish();
    expect(await done).toEqual({ status: 'ready', path: FINAL, total: 1000 });
    expect(states.map((s) => s.status)).toEqual(['absent', 'downloading', 'downloading', 'verifying', 'ready']);
    expect(storage.hashed).toEqual([PART]);
    expect(storage.readText(MARKER)).toBe(SHA);
    expect(storage.size(PART)).toBeNull();
    expect(storage.size(META)).toBeNull();
    expect(network.listening).toBe(0);

    expect(await d.start()).toMatchObject({ status: 'ready' });
    expect(storage.transfers).toHaveLength(1);
    expect(downloader().restore()).toEqual({ status: 'ready', path: FINAL, total: 1000 });
  });

  it('deletes the file and reports a checksum failure when the SHA-256 does not match', async () => {
    storage.served = { size: 1000, sha: 'b'.repeat(64) };
    const d = downloader();
    const done = d.start();
    await flush();
    storage.lastTransfer.finish();
    expect(await done).toMatchObject({ status: 'failed', error: 'checksum', bytes: 0, detail: `sha256 ${'b'.repeat(64)}` });
    expect(storage.size(PART)).toBeNull();
    expect(storage.size(FINAL)).toBeNull();
    expect(storage.size(MARKER)).toBeNull();

    storage.served = { size: 1000, sha: SHA };
    const again = d.start();
    await flush();
    expect(storage.lastTransfer.startOffset).toBe(0);
    storage.lastTransfer.finish();
    expect(await again).toMatchObject({ status: 'ready' });
  });

  it('rejects a file of the wrong size without hashing it', async () => {
    storage.served = { size: 999, sha: SHA };
    const d = downloader();
    const done = d.start();
    await flush();
    storage.lastTransfer.finish();
    expect(await done).toMatchObject({ status: 'failed', error: 'checksum', detail: 'size 999 instead of 1000' });
    expect(storage.hashed).toEqual([]);
    expect(storage.size(PART)).toBeNull();
  });

  it('pauses and resumes from the byte where it stopped', async () => {
    const d = downloader();
    const first = d.start();
    await flush();
    storage.lastTransfer.receive(300);
    await d.pause();
    expect(await first).toEqual({ status: 'paused', bytes: 300, total: 1000, reason: 'user' });
    expect(JSON.parse(storage.readText(META) ?? '{}')).toEqual({ sha256: SHA, token: JSON.stringify({ offset: 300 }) });

    const second = d.start();
    await flush();
    expect(storage.lastTransfer.startOffset).toBe(300);
    expect(d.state).toEqual({ status: 'downloading', bytes: 300, total: 1000 });
    storage.lastTransfer.finish();
    expect(await second).toMatchObject({ status: 'ready' });
  });

  it('continues after the app was closed in the middle of a download', async () => {
    const first = downloader();
    const running = first.start();
    await flush();
    storage.lastTransfer.receive(500);
    // The process dies here: no pause, the token in the meta file was cleared at start.
    void running;

    const d = downloader();
    expect(d.restore()).toEqual({ status: 'paused', bytes: 500, total: 1000, reason: 'interrupted' });
    const done = d.start();
    await flush();
    expect(storage.lastTransfer.startOffset).toBe(500);
    storage.lastTransfer.finish();
    expect(await done).toMatchObject({ status: 'ready' });
  });

  it('starts over where the platform cannot continue from a byte offset', async () => {
    storage.resumesFromOffset = false;
    storage.files.set(PART, { size: 500 });
    storage.writeText(META, JSON.stringify({ sha256: SHA, token: null }));
    const d = downloader();
    expect(d.restore()).toMatchObject({ status: 'paused', bytes: 500 });
    const done = d.start();
    await flush();
    expect(storage.lastTransfer.startOffset).toBe(0);
    expect(d.state).toEqual({ status: 'downloading', bytes: 0, total: 1000 });
    storage.lastTransfer.finish();
    expect(await done).toMatchObject({ status: 'ready' });
  });

  it('throws away a partial file of another pinned version, and a truncated model file', () => {
    storage.files.set(PART, { size: 500 });
    storage.writeText(META, JSON.stringify({ sha256: 'c'.repeat(64), token: null }));
    expect(downloader().restore()).toEqual({ status: 'absent' });
    expect(storage.size(PART)).toBeNull();
    expect(storage.size(META)).toBeNull();

    storage.files.set(FINAL, { size: 700, sha: SHA });
    storage.writeText(MARKER, SHA);
    expect(downloader().restore()).toEqual({ status: 'absent' });
    expect(storage.size(FINAL)).toBeNull();
    expect(storage.size(MARKER)).toBeNull();
  });

  it('checks a complete file again, without downloading it, when the app closed before the check ended', async () => {
    storage.files.set(FINAL, { size: 1000, sha: SHA });
    const d = downloader();
    expect(d.restore()).toEqual({ status: 'paused', bytes: 1000, total: 1000, reason: 'interrupted' });
    network.link = OFFLINE;
    expect(await d.start()).toEqual({ status: 'ready', path: FINAL, total: 1000 });
    expect(storage.transfers).toHaveLength(0);
    expect(storage.hashed).toEqual([PART]);
    expect(storage.readText(MARKER)).toBe(SHA);
  });

  it('uses Wi-Fi only unless mobile data is allowed', async () => {
    network.link = CELLULAR;
    const d = downloader();
    expect(await d.start()).toEqual({ status: 'failed', error: 'wifi_required', bytes: 0, total: 1000 });
    expect(storage.transfers).toHaveLength(0);

    allowCellular = true;
    const done = d.start();
    await flush();
    expect(d.state.status).toBe('downloading');
    storage.lastTransfer.finish();
    expect(await done).toMatchObject({ status: 'ready' });
  });

  it('pauses when Wi-Fi goes away and continues when it is back', async () => {
    const d = downloader();
    const first = d.start();
    await flush();
    storage.lastTransfer.receive(200);
    network.set(CELLULAR);
    expect(await first).toEqual({ status: 'paused', bytes: 200, total: 1000, reason: 'network' });
    await flush();
    expect(storage.transfers).toHaveLength(1);

    network.set(WIFI);
    await flush(10);
    expect(storage.transfers).toHaveLength(2);
    expect(storage.lastTransfer.startOffset).toBe(200);
    expect(d.state).toEqual({ status: 'downloading', bytes: 200, total: 1000 });
  });

  it('allows mobile data when the user turns it on, and continues a download that waited for Wi-Fi', async () => {
    network.link = CELLULAR;
    const d = downloader();
    await d.start();
    expect(d.state).toMatchObject({ status: 'failed', error: 'wifi_required' });
    allowCellular = true;
    await d.recheckNetwork();
    await flush(10);
    expect(d.state.status).toBe('downloading');
  });

  it('says when the phone is offline or the storage is too small', async () => {
    network.link = OFFLINE;
    expect(await downloader().start()).toMatchObject({ status: 'failed', error: 'offline' });

    network.link = WIFI;
    storage.free = 1000 + 299;
    expect(await downloader(300).start()).toMatchObject({ status: 'failed', error: 'no_space' });
    storage.files.set(PART, { size: 400 });
    storage.writeText(META, JSON.stringify({ sha256: SHA, token: null }));
    const d = downloader(300);
    d.restore();
    const done = d.start();
    await flush();
    expect(d.state).toEqual({ status: 'downloading', bytes: 400, total: 1000 });
    storage.lastTransfer.finish();
    expect(await done).toMatchObject({ status: 'ready' });
  });

  it('keeps the partial file after a network error and continues from it', async () => {
    const d = downloader();
    const first = d.start();
    await flush();
    storage.lastTransfer.receive(650);
    storage.lastTransfer.error('HTTP 503');
    expect(await first).toEqual({ status: 'failed', error: 'network', bytes: 650, total: 1000, detail: 'HTTP 503' });

    const second = d.start();
    await flush();
    expect(storage.lastTransfer.startOffset).toBe(650);
    storage.lastTransfer.finish();
    expect(await second).toMatchObject({ status: 'ready' });
  });

  it('cancel stops and deletes the partial download; delete removes the model', async () => {
    const d = downloader();
    const running = d.start();
    await flush();
    storage.lastTransfer.receive(100);
    expect(d.cancel()).toEqual({ status: 'absent' });
    expect(await running).toEqual({ status: 'absent' });
    expect(storage.size(PART)).toBeNull();
    expect(storage.size(META)).toBeNull();
    expect(network.listening).toBe(0);

    const done = d.start();
    await flush();
    storage.lastTransfer.finish();
    await done;
    expect(d.delete()).toEqual({ status: 'absent' });
    expect(storage.size(FINAL)).toBeNull();
    expect(storage.size(MARKER)).toBeNull();
  });

  it('cancel during the checksum leaves nothing behind', async () => {
    let release!: () => void;
    storage.hashing = new Promise<void>((resolve) => {
      release = resolve;
    });
    const d = downloader();
    const done = d.start();
    await flush();
    storage.lastTransfer.finish();
    await flush();
    expect(d.state.status).toBe('verifying');
    d.cancel();
    release();
    expect(await done).toEqual({ status: 'absent' });
    expect(storage.size(FINAL)).toBeNull();
    expect(storage.size(PART)).toBeNull();
  });

  it('runs one transfer when start is called twice', async () => {
    const d = downloader();
    const a = d.start();
    const b = d.start();
    expect(b).toBe(a);
    await flush();
    storage.lastTransfer.finish();
    await a;
    expect(storage.transfers).toHaveLength(1);
  });
});
