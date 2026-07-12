import { spawn, type ChildProcess } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

/**
 * Serialize a JSON object as a single LF-terminated JSON line.
 * Framing is strictly LF-only (see attachJsonlReader).
 */
export function serializeJsonLine(obj: unknown): string {
  return JSON.stringify(obj) + '\n';
}

/**
 * Strict JSON-lines reader: buffers stdio chunks, splits on `\n` ONLY, and
 * strips a trailing `\r` (CRLF tolerance). Deliberately avoids node:readline,
 * which also splits on U+2028 / U+2029 — both of which are valid inside JSON
 * string values and would corrupt framing.
 *
 * Uses StringDecoder so a multi-byte UTF-8 sequence split across two chunks is
 * reassembled before being treated as text.
 */
export function attachJsonlReader(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => void,
  options: { maxBufferedBytes?: number; onLimitExceeded?: (bytes: number) => void } = {},
): () => void {
  const decoder = new StringDecoder('utf8');
  let buffer = '';

  const onData = (chunk: Buffer | string): void => {
    buffer += decoder.write(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    const bufferedBytes = Buffer.byteLength(buffer, 'utf8');
    if (options.maxBufferedBytes !== undefined && bufferedBytes > options.maxBufferedBytes) {
      buffer = '';
      options.onLimitExceeded?.(bufferedBytes);
      return;
    }
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (line.length > 0) onLine(line);
    }
  };

  const onEnd = (): void => {
    const tail = buffer + decoder.end();
    let line = tail;
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.length > 0) onLine(line);
    buffer = '';
  };

  stream.on('data', onData);
  stream.on('end', onEnd);

  return (): void => {
    stream.off('data', onData);
    stream.off('end', onEnd);
  };
}

export type PiEventListener = (event: Record<string, unknown>) => void;

export interface PiRpcClientOptions {
  /** Path to the pi CLI. When nodeBin is set this is the JS entry; otherwise the spawn target. */
  piBin?: string;
  /** Node executable used to run the pi JS entry directly (bypasses .cmd shims). */
  nodeBin?: string;
  /** Working directory for the pi process (the task's worktree path). */
  cwd?: string;
  /** Extra environment variables merged on top of process.env. */
  env?: Record<string, string>;
  /** Optional dedicated Pi state directory, instead of the user's ~/.pi/agent. */
  agentDir?: string;
  provider?: string;
  model?: string;
  /** Explicit persistent Pi JSONL session file. */
  sessionPath?: string;
  /** Extra CLI args appended after --mode rpc. */
  args?: string[];
  /** Optional process wrapper, such as bubblewrap. Pi itself remains the child command. */
  command?: string;
  commandArgs?: string[];
}

export type PiProcessInfo = {
  pid: number | null;
  command: string;
  cwd: string;
  sandboxed: boolean;
};

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const RESPONSE_TIMEOUT_MS = 30_000;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_STDOUT_BUFFER_BYTES = 1024 * 1024;
const PI_PACKAGE_CLI = ['node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'cli.js'];

function defaultPiBin(): string {
  return process.platform === 'win32' ? 'pi.cmd' : 'pi';
}

async function terminateProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      killer.once('error', () => resolve());
      killer.once('exit', () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try { child.kill('SIGTERM'); } catch { /* best effort */ }
  }
}

export function buildPiRpcArgs(options: Pick<PiRpcClientOptions, 'provider' | 'model' | 'sessionPath' | 'args'>): string[] {
  const extra: string[] = [];
  if (options.provider) extra.push('--provider', options.provider);
  if (options.model) extra.push('--model', options.model);
  if (options.sessionPath) {
    extra.push('--session', options.sessionPath, '--session-dir', dirname(options.sessionPath));
  }
  if (options.args) extra.push(...options.args);
  return ['--mode', 'rpc', ...extra];
}

/** Locate `bin` (e.g. "pi.cmd") on PATH and return its absolute path, or null. */
function findOnPath(bin: string): string | null {
  const pathExt = process.env.PATHEXT ? process.env.PATHEXT.split(';').filter(Boolean) : [''];
  const sep = process.platform === 'win32' ? ';' : ':';
  const dirs = (process.env.PATH ?? '').split(sep).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of pathExt) {
      const candidate = join(dir, bin.toLowerCase().endsWith(ext.toLowerCase()) ? bin : bin + ext);
      try {
        if (existsSync(candidate)) return candidate;
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/**
 * Read a `.cmd`/`.bat` shim and extract the JS entry path it invokes with node.
 * Returns the absolute path if resolvable.
 */
function extractJsFromShim(cmdPath: string): string | null {
  try {
    const text = readFileSync(cmdPath, 'utf8');
    const match = text.match(/"([^"]+\.js)"/);
    if (!match) return null;
    const ref = match[1].replace(/%dp0%/gi, '.').replace(/%~dp0/gi, '.');
    const resolved = resolve(dirname(cmdPath), ref);
    return existsSync(resolved) ? resolved : null;
  } catch {
    return null;
  }
}

/**
 * On Windows, spawning a `.cmd` shim directly is rejected by Node (EINVAL, per
 * CVE-2024-27980). Resolve the underlying JS entry so we can spawn `node`
 * directly — giving us direct stdio pipes and clean child lifecycle control.
 */
function resolvePiEntry(bin: string): string | null {
  if (/\.cmd$/i.test(bin)) {
    const abs = isAbsolute(bin) ? bin : findOnPath(bin);
    if (abs) {
      const fromShim = extractJsFromShim(abs);
      if (fromShim) return fromShim;
    }
  }
  // Fallback heuristic: the npm global node_modules sits next to node.exe.
  const candidate = join(dirname(process.execPath), ...PI_PACKAGE_CLI);
  return existsSync(candidate) ? candidate : null;
}

/**
 * A client for the `pi --mode rpc` JSON-lines protocol over stdio.
 *
 * - One JSON object per line, LF-only framing (see attachJsonlReader).
 * - Commands carry an `id`; responses correlate by `id` and resolve send().
 * - Streamed events (no `id` / type !== 'response') are delivered to listeners.
 */
export class PiRpcClient {
  private child: ChildProcess | null = null;
  private requestId = 0;
  private readonly pending = new Map<string, PendingRequest>();
  private stopReader: (() => void) | null = null;
  private stderrBuffer = '';
  private readonly listeners = new Set<PiEventListener>();
  private idleResolvers: Array<() => void> = [];
  private exited = false;
  private processInfo: PiProcessInfo | null = null;

  constructor(private readonly opts: PiRpcClientOptions = {}) {}

  private resolveSpawnTarget(): { command: string; args: string[] } {
    const rpcArgs = buildPiRpcArgs(this.opts);

    let target: { command: string; args: string[] };
    if (this.opts.nodeBin) {
      const cliPath = this.opts.piBin ?? defaultPiBin();
      target = { command: this.opts.nodeBin, args: [cliPath, ...rpcArgs] };
    } else {
      const bin = this.opts.piBin ?? defaultPiBin();
      if (process.platform === 'win32' && /\.cmd$/i.test(bin)) {
        const cliJs = resolvePiEntry(bin);
        if (cliJs) {
          target = { command: process.execPath, args: [cliJs, ...rpcArgs] };
        } else {
          target = { command: bin, args: rpcArgs };
        }
      } else {
        target = { command: bin, args: rpcArgs };
      }
    }
    return this.opts.command
      ? { command: this.opts.command, args: [...(this.opts.commandArgs ?? []), '--', target.command, ...target.args] }
      : target;
  }

  async start(): Promise<void> {
    if (this.child) return;
    const { command, args } = this.resolveSpawnTarget();

    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: this.opts.cwd,
        env: {
          ...process.env,
          ...this.opts.env,
          ...(this.opts.agentDir ? { PI_CODING_AGENT_DIR: this.opts.agentDir } : {}),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch (err) {
      throw new Error(
        `Failed to spawn pi (${command} ${args.join(' ')}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.child = child;
    this.processInfo = {
      pid: child.pid ?? null,
      command,
      cwd: this.opts.cwd ?? process.cwd(),
      sandboxed: Boolean(this.opts.command),
    };

    child.on('error', (err) => this.handleFatal(err));
    child.on('exit', (code, signal) => this.handleExit(code, signal));

    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => {
        this.stderrBuffer = (this.stderrBuffer + chunk.toString('utf8')).slice(-MAX_STDERR_BYTES);
      });
    }
    if (child.stdout) {
      this.stopReader = attachJsonlReader(child.stdout, (line) => this.handleLine(line), {
        maxBufferedBytes: MAX_STDOUT_BUFFER_BYTES,
        onLimitExceeded: (bytes) => {
          this.handleFatal(new Error(`pi stdout line exceeded ${MAX_STDOUT_BUFFER_BYTES} bytes (${bytes} bytes observed)`));
          void this.stop();
        },
      });
    }

    // Give the process a moment to either come alive or fail fast (ENOENT etc).
    await new Promise((r) => setTimeout(r, 100));
    if (this.exited || child.exitCode !== null || child.signalCode) {
      throw new Error(
        `pi process exited prematurely (code=${child.exitCode}, signal=${child.signalCode}). stderr: ${this.stderrBuffer.trim()}`,
      );
    }
  }

  private handleLine(line: string): void {
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      return;
    }
    if (!obj || typeof obj !== 'object') return;
    const record = obj as Record<string, unknown>;
    if (record.type === 'response' && typeof record.id === 'string') {
      const entry = this.pending.get(record.id);
      if (entry) {
        clearTimeout(entry.timer);
        this.pending.delete(record.id);
        if (record.success === false) {
          const errMsg =
            typeof record.error === 'string' ? record.error : `pi command ${record.id} failed`;
          entry.reject(new Error(errMsg));
        } else {
          entry.resolve(record);
        }
      }
      return;
    }
    if (record.type === 'agent_end') {
      const resolvers = this.idleResolvers;
      this.idleResolvers = [];
      for (const r of resolvers) {
        try {
          r();
        } catch {
          /* ignore */
        }
      }
    }
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch {
        /* listener errors must not break the reader */
      }
    }
  }

  private rejectAll(error: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private handleFatal(err: Error): void {
    this.exited = true;
    this.rejectAll(
      new Error(`pi process error: ${err.message}. stderr: ${this.stderrBuffer.trim()}`),
    );
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.exited = true;
    this.rejectAll(
      new Error(
        `pi process exited (code=${code}, signal=${signal}). stderr: ${this.stderrBuffer.trim()}`,
      ),
    );
  }

  onEvent(listener: PiEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getProcessInfo(): PiProcessInfo | null {
    return this.processInfo;
  }

  /**
   * Send a command object. Assigns `id: 'req_<n>'` and resolves with the full
   * `{type:'response', id, success, ...}` object (or rejects on failure /
   * 30s timeout / child exit).
   */
  send(command: Record<string, unknown>): Promise<unknown> {
    const child = this.child;
    if (!child || !child.stdin || this.exited) {
      return Promise.reject(new Error('pi client not started or already exited'));
    }
    const id = 'req_' + ++this.requestId;
    const line = serializeJsonLine({ ...command, id });
    return new Promise((resolveFn, rejectFn) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectFn(new Error(`pi request ${id} timed out after ${RESPONSE_TIMEOUT_MS}ms`));
      }, RESPONSE_TIMEOUT_MS);
      this.pending.set(id, { resolve: resolveFn, reject: rejectFn, timer });
      child.stdin!.write(line, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(id);
          rejectFn(new Error(`failed to write to pi stdin: ${err.message}`));
        }
      });
    });
  }

  prompt(message: string, images?: string[]): Promise<unknown> {
    return this.send(images ? { type: 'prompt', message, images } : { type: 'prompt', message });
  }
  steer(message: string, images?: string[]): Promise<unknown> {
    return this.send(images ? { type: 'steer', message, images } : { type: 'steer', message });
  }
  followUp(message: string, images?: string[]): Promise<unknown> {
    return this.send(images ? { type: 'follow_up', message, images } : { type: 'follow_up', message });
  }
  abort(): Promise<unknown> {
    return this.send({ type: 'abort' });
  }
  getState(): Promise<unknown> {
    return this.send({ type: 'get_state' });
  }
  switchSession(sessionPath: string): Promise<unknown> {
    return this.send({ type: 'switch_session', sessionPath });
  }
  newSession(parentSession?: string): Promise<unknown> {
    return this.send(parentSession ? { type: 'new_session', parentSession } : { type: 'new_session' });
  }
  getEntries(since?: number): Promise<unknown> {
    return this.send(since !== undefined ? { type: 'get_entries', since } : { type: 'get_entries' });
  }

  /** Resolves when an `agent_end` event is observed. */
  waitForIdle(timeout = 60_000): Promise<void> {
    return new Promise<void>((resolveFn, rejectFn) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.idleResolvers = this.idleResolvers.filter((r) => r !== resolver);
        fn();
      };
      const timer = setTimeout(() => finish(() => rejectFn(new Error(`waitForIdle timed out after ${timeout}ms`))), timeout);
      const resolver = (): void => finish(() => resolveFn());
      this.idleResolvers.push(resolver);
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    if (this.stopReader) {
      this.stopReader();
      this.stopReader = null;
    }
    this.rejectAll(new Error('pi client stopped'));

    await new Promise<void>((resolveStop) => {
      let done = false;
      const finalize = (): void => {
        if (done) return;
        done = true;
        resolveStop();
      };
      const forceTreeTimer = setTimeout(() => {
        if (!child.killed) void terminateProcessTree(child);
      }, 500);
      child.once('exit', () => {
        clearTimeout(forceTreeTimer);
        finalize();
      });
      try {
        child.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        if (!child.killed) void terminateProcessTree(child);
        finalize();
      }, 1000);
    });
  }
}
