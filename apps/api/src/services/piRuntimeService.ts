import type { EventType, RealtimeEnvelope, SendMessageInput } from '@pi-agents/contracts';
import { PiRpcClient } from './piRpcClient';
import { mapPiEventToEnvelope } from './piEventMap';

export type RuntimeEventHandler = (event: RealtimeEnvelope) => void;

export interface PiRuntime {
  prompt(sessionId: string, input: SendMessageInput): Promise<void>;
  steer(sessionId: string, text: string): Promise<void>;
  followUp(sessionId: string, text: string): Promise<void>;
  abort(sessionId: string, reason?: string): Promise<void>;
  subscribe(sessionId: string, handler: RuntimeEventHandler): () => void;
  acquireLock(sessionId: string, owner: string): boolean;
  releaseLock(sessionId: string, owner: string): boolean;
}

type SessionLock = { owner: string; acquiredAt: string };

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/**
 * Shared lock + subscription bookkeeping used by both the fake runtime and
 * the real adapter stub so that lock semantics stay consistent and testable.
 */
abstract class BaseRuntime implements PiRuntime {
  protected subscribers = new Map<string, Set<RuntimeEventHandler>>();
  protected locks = new Map<string, SessionLock>();

  subscribe(sessionId: string, handler: RuntimeEventHandler): () => void {
    let set = this.subscribers.get(sessionId);
    if (!set) {
      set = new Set();
      this.subscribers.set(sessionId, set);
    }
    set.add(handler);
    return () => {
      const s = this.subscribers.get(sessionId);
      if (!s) return;
      s.delete(handler);
      if (s.size === 0) this.subscribers.delete(sessionId);
    };
  }

  acquireLock(sessionId: string, owner: string): boolean {
    const existing = this.locks.get(sessionId);
    if (!existing || existing.owner === owner) {
      this.locks.set(sessionId, { owner, acquiredAt: nowIso() });
      return true;
    }
    return false;
  }

  releaseLock(sessionId: string, owner: string): boolean {
    const existing = this.locks.get(sessionId);
    if (!existing || existing.owner !== owner) return false;
    this.locks.delete(sessionId);
    return true;
  }

  protected emit(sessionId: string, type: EventType, payload: unknown): void {
    const envelope: RealtimeEnvelope = {
      id: newId(),
      stream: 'task',
      streamId: sessionId,
      type,
      payload,
      createdAt: nowIso(),
    };
    const set = this.subscribers.get(sessionId);
    if (!set) return;
    for (const handler of set) handler(envelope);
  }

  abstract prompt(sessionId: string, input: SendMessageInput): Promise<void>;
  abstract steer(sessionId: string, text: string): Promise<void>;
  abstract followUp(sessionId: string, text: string): Promise<void>;
  abstract abort(sessionId: string, reason?: string): Promise<void>;
}

export class FakePiRuntime extends BaseRuntime implements PiRuntime {
  async prompt(sessionId: string, input: SendMessageInput): Promise<void> {
    this.emit(sessionId, 'run.started', {
      behavior: input.behavior,
      mode: input.mode,
    });

    const messageId = newId();
    this.emit(sessionId, 'message.created', {
      role: 'assistant',
      messageId,
      text: '',
    });

    await tick();
    this.emit(sessionId, 'message.delta', { messageId, delta: `Working on: ${input.text}` });

    this.emit(sessionId, 'tool.started', {
      tool: 'read_file',
      args: { path: 'README.md' },
    });
    this.emit(sessionId, 'tool.completed', {
      tool: 'read_file',
      output: `# ${input.text}\n`,
    });

    await tick();
    this.emit(sessionId, 'message.delta', { messageId, delta: 'Done. ' });
    this.emit(sessionId, 'message.completed', { role: 'assistant', messageId });
    this.emit(sessionId, 'run.completed', {});
  }

  async steer(sessionId: string, text: string): Promise<void> {
    this.emit(sessionId, 'queue.updated', { type: 'steer', text });
  }

  async followUp(sessionId: string, text: string): Promise<void> {
    this.emit(sessionId, 'queue.updated', { type: 'follow_up', text });
  }

  async abort(sessionId: string, reason?: string): Promise<void> {
    this.emit(sessionId, 'run.aborted', { reason: reason ?? 'aborted' });
  }
}

export interface PiRuntimeAdapterOptions {
  piBin?: string;
  nodeBin?: string;
  provider?: string;
  model?: string;
  args?: string[];
  env?: Record<string, string>;
  defaultCwd?: string;
}

interface AdapterSessionState {
  client: PiRpcClient;
  started: Promise<void>;
}

/**
 * Real Pi CLI integration backed by a per-session `pi --mode rpc` child process.
 *
 * - One rpc client (and therefore one writer) per session, gated by the lock
 *   inherited from BaseRuntime (reentrant for owner 'runtime').
 * - subscribe() is inherited and fans mapped RealtimeEnvelopes to handlers; the
 *   raw pi events are translated via mapPiEventToEnvelope.
 * - prompt() awaits pi's acknowledgement but does NOT block on agent_end — the
 *   streamed content is delivered to subscribers as it arrives. Callers that
 *   need to know the turn finished should listen for run.completed (or use the
 *   client's waitForIdle when holding the lock directly).
 * - releaseLock() tears the client down (the writer is done); dispose() stops
 *   every session's client for shutdown/tests.
 */
export class PiRuntimeAdapter extends BaseRuntime implements PiRuntime {
  private readonly sessions = new Map<string, AdapterSessionState>();
  private readonly adapterOpts: PiRuntimeAdapterOptions;

  constructor(opts?: PiRuntimeAdapterOptions) {
    super();
    this.adapterOpts = {
      piBin: opts?.piBin ?? process.env.PI_BIN,
      nodeBin: opts?.nodeBin ?? process.env.PI_NODE,
      provider: opts?.provider ?? process.env.PI_PROVIDER,
      model: opts?.model ?? process.env.PI_MODEL,
      args: opts?.args,
      env: opts?.env,
      defaultCwd: opts?.defaultCwd ?? process.env.PI_CWD,
    };
  }

  private ensureClient(sessionId: string, cwd?: string): AdapterSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const client = new PiRpcClient({
      piBin: this.adapterOpts.piBin,
      nodeBin: this.adapterOpts.nodeBin,
      provider: this.adapterOpts.provider,
      model: this.adapterOpts.model,
      args: this.adapterOpts.args,
      env: this.adapterOpts.env,
      cwd: cwd ?? this.adapterOpts.defaultCwd,
    });
    client.onEvent((event) => {
      const envelope = mapPiEventToEnvelope(event, { sessionId });
      if (!envelope) return;
      const set = this.subscribers.get(sessionId);
      if (!set) return;
      for (const handler of set) {
        try {
          handler(envelope);
        } catch {
          /* a listener must not break the fan-out */
        }
      }
    });
    const started = client.start();
    const state: AdapterSessionState = { client, started };
    this.sessions.set(sessionId, state);
    return state;
  }

  async prompt(sessionId: string, input: SendMessageInput): Promise<void> {
    const state = this.ensureClient(sessionId);
    await state.started;
    if (!this.acquireLock(sessionId, 'runtime')) {
      throw new Error('Task already running');
    }
    const imageUris = input.attachments
      ?.filter((a) => a.kind === 'image')
      .map((a) => a.uri);
    const images = imageUris && imageUris.length > 0 ? imageUris : undefined;
    try {
      await state.client.prompt(input.text, images);
    } catch (err) {
      this.releaseLock(sessionId, 'runtime');
      this.emit(sessionId, 'run.error', {
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async steer(sessionId: string, text: string): Promise<void> {
    const state = this.ensureClient(sessionId);
    await state.started;
    await state.client.steer(text);
  }

  async followUp(sessionId: string, text: string): Promise<void> {
    const state = this.ensureClient(sessionId);
    await state.started;
    await state.client.followUp(text);
  }

  async abort(sessionId: string, reason?: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state) {
      try {
        await state.client.abort();
      } catch {
        /* best-effort abort */
      }
    }
    this.emit(sessionId, 'run.aborted', { reason: reason ?? 'aborted' });
  }

  releaseLock(sessionId: string, owner: string): boolean {
    const ok = super.releaseLock(sessionId, owner);
    if (!ok) return false;
    const state = this.sessions.get(sessionId);
    if (state) {
      this.sessions.delete(sessionId);
      void state.client.stop();
    }
    return true;
  }

  async dispose(): Promise<void> {
    const states = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(states.map((s) => s.client.stop()));
  }
}

export function createRuntime(mode?: 'fake' | 'pi'): PiRuntime {
  const resolved = mode ?? (process.env.PI_MODE === 'pi' ? 'pi' : 'fake');
  return resolved === 'pi' ? new PiRuntimeAdapter() : new FakePiRuntime();
}
