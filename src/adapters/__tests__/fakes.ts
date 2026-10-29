import type {
  LlamaCompletionParams,
  LlamaCompletionResult,
  LlamaContextLike,
  LlamaInitParams,
  LlamaRuntime,
  ModelStorage,
  NetworkInfo,
  NetworkPort,
  Transfer,
} from '../model';

/**
 * Test doubles for the on device model ports: an in memory file system with
 * a fake HTTP transfer that the test drives byte by byte, a network that can
 * switch between Wi-Fi, mobile data and nothing, and a llama.rn runtime.
 */

interface FakeFile {
  size: number;
  /** Text content for small files (markers, resume tokens, settings). */
  text?: string;
  /** What sha256() returns for this file. */
  sha?: string;
}

export const WIFI: NetworkInfo = { connected: true, unmetered: true };
export const CELLULAR: NetworkInfo = { connected: true, unmetered: false };
export const OFFLINE: NetworkInfo = { connected: false, unmetered: false };

export class FakeNetwork implements NetworkPort {
  private listeners = new Set<(info: NetworkInfo) => void>();

  constructor(public link: NetworkInfo = WIFI) {}

  async current(): Promise<NetworkInfo> {
    return this.link;
  }

  subscribe(listener: (info: NetworkInfo) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get listening(): number {
    return this.listeners.size;
  }

  set(link: NetworkInfo): void {
    this.link = link;
    for (const listener of [...this.listeners]) listener(link);
  }
}

/** The bytes a fake server sends for every URL. */
export interface ServedFile {
  size: number;
  sha: string;
}

export class FakeTransfer implements Transfer {
  private settle: ((outcome: 'done' | 'paused') => void) | null = null;
  private fail: ((error: Error) => void) | null = null;
  private pausedAt: number | null = null;
  readonly startOffset: number;

  constructor(
    private readonly storage: MemoryStorage,
    readonly url: string,
    readonly path: string,
    readonly token: string | null,
    private readonly onProgress: (bytes: number) => void,
  ) {
    this.startOffset = token ? (JSON.parse(token) as { offset: number }).offset : 0;
  }

  run(): Promise<'done' | 'paused'> {
    // Like the platform task: continue at the offset, or start an empty file.
    this.storage.files.set(this.path, { size: this.startOffset });
    return new Promise((resolve, reject) => {
      this.settle = resolve;
      this.fail = reject;
    });
  }

  /** The server sent bytes up to this offset. */
  receive(bytes: number): void {
    this.storage.files.set(this.path, { size: bytes });
    this.onProgress(bytes);
  }

  /** The server finished: the file has the served size and content. */
  finish(served: ServedFile = this.storage.served): void {
    this.storage.files.set(this.path, { size: served.size, sha: served.sha });
    this.settle?.('done');
  }

  error(message = 'Connection reset'): void {
    this.fail?.(new Error(message));
  }

  async pause(): Promise<void> {
    this.pausedAt = this.storage.size(this.path) ?? 0;
    this.settle?.('paused');
  }

  cancel(): void {
    this.fail?.(new Error('cancelled'));
  }

  resumeToken(): string | null {
    return this.pausedAt === null ? null : JSON.stringify({ offset: this.pausedAt });
  }
}

export class MemoryStorage implements ModelStorage {
  readonly files = new Map<string, FakeFile>();
  readonly transfers: FakeTransfer[] = [];
  free: number | null = 64 * 1024 ** 3;
  /** Android continues from the partial file; iOS needs a saved token. */
  resumesFromOffset = true;
  served: ServedFile = { size: 0, sha: '' };
  hashing: Promise<void> | null = null;
  readonly hashed: string[] = [];

  path(name: string): string {
    return `file:///data/models/${name}`;
  }

  size(path: string): number | null {
    return this.files.get(path)?.size ?? null;
  }

  remove(path: string): void {
    this.files.delete(path);
  }

  move(from: string, to: string): void {
    const file = this.files.get(from);
    if (!file) throw new Error(`No file at ${from}`);
    this.files.delete(from);
    this.files.set(to, file);
  }

  readText(path: string): string | null {
    const file = this.files.get(path);
    return file ? (file.text ?? '') : null;
  }

  writeText(path: string, text: string): void {
    this.files.set(path, { size: text.length, text });
  }

  async sha256(path: string): Promise<string> {
    this.hashed.push(path);
    await this.hashing;
    const file = this.files.get(path);
    if (!file) throw new Error(`No file at ${path}`);
    return file.sha ?? '0'.repeat(64);
  }

  freeBytes(): number | null {
    return this.free;
  }

  transfer(url: string, path: string, token: string | null, onProgress: (bytes: number) => void): FakeTransfer {
    const transfer = new FakeTransfer(this, url, path, token, onProgress);
    this.transfers.push(transfer);
    return transfer;
  }

  tokenFromPartial(_url: string, _path: string, bytes: number): string | null {
    return this.resumesFromOffset ? JSON.stringify({ offset: bytes }) : null;
  }

  get lastTransfer(): FakeTransfer {
    const transfer = this.transfers.at(-1);
    if (!transfer) throw new Error('No transfer started');
    return transfer;
  }
}

type Reply = LlamaCompletionResult | ((params: LlamaCompletionParams, context: FakeContext) => Promise<LlamaCompletionResult>);

export class FakeContext implements LlamaContextLike {
  readonly completions: LlamaCompletionParams[] = [];
  released = false;
  stops = 0;
  running = 0;
  maxRunning = 0;
  private interrupt: (() => void) | null = null;

  constructor(private readonly runtime: FakeLlama) {}

  async completion(params: LlamaCompletionParams): Promise<LlamaCompletionResult> {
    if (this.released) throw new Error('Context released');
    this.completions.push(params);
    this.running++;
    this.maxRunning = Math.max(this.maxRunning, this.running);
    try {
      if (params.n_predict === 0) return { text: '' };
      const reply = this.runtime.reply;
      return typeof reply === 'function' ? await reply(params, this) : reply;
    } finally {
      this.running--;
    }
  }

  /** A completion that only ends when stopCompletion() is called, like a slow phone. */
  hang(): Promise<LlamaCompletionResult> {
    return new Promise((resolve) => {
      this.interrupt = () => resolve({ text: '' });
    });
  }

  async stopCompletion(): Promise<void> {
    this.stops++;
    this.interrupt?.();
    this.interrupt = null;
  }

  async release(): Promise<void> {
    this.released = true;
  }

  isJinjaSupported(): boolean {
    return this.runtime.jinja;
  }
}

/** A tool call the way llama.rn returns it: arguments as a JSON string. */
export function toolCallResult(name: string, args: Record<string, unknown>): LlamaCompletionResult {
  return { text: '', content: '', tool_calls: [{ function: { name, arguments: JSON.stringify(args) } }] };
}

export class FakeLlama implements LlamaRuntime {
  readonly inits: LlamaInitParams[] = [];
  readonly contexts: FakeContext[] = [];
  jinja = true;
  failInit: Error | null = null;
  /** Resolves pending initLlama calls when set; a pending promise makes loads slow. */
  loading: Promise<void> | null = null;
  reply: Reply = toolCallResult('navigate', { action: 'home' });

  async initLlama(params: LlamaInitParams): Promise<FakeContext> {
    this.inits.push(params);
    await this.loading;
    if (this.failInit) throw this.failInit;
    const context = new FakeContext(this);
    this.contexts.push(context);
    return context;
  }

  get lastContext(): FakeContext {
    const context = this.contexts.at(-1);
    if (!context) throw new Error('No context loaded');
    return context;
  }
}

/** Lets pending promise callbacks run. */
export async function flush(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}
