import type { EventType, SendMessageInput } from '@pi-agents/contracts';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RealtimeEventDraft } from '../realtime/eventStore';
import { PiRpcClient, type PiProcessInfo } from './piRpcClient';
import { mapPiEventToEnvelope } from './piEventMap';
import { piResourceArgs } from './piResources';
import { createPiSandboxLaunch, type PiSandboxOptions } from './piSandbox';
import { updatePiSessionCwd } from './piSessionBranch';

export type RuntimeEventHandler = (event: RealtimeEventDraft) => void;

export type RuntimeSessionContext = {
  sessionId: string;
  cwd: string;
  sessionPath: string;
  resourceRoot?: string;
  agentsDir?: string;
  allowedTools?: string[];
};

export type RuntimeProcessInfo = PiProcessInfo;

export interface PiRuntime {
  prepare(session: RuntimeSessionContext): Promise<void>;
  prompt(sessionId: string, input: SendMessageInput): Promise<void>;
  steer(sessionId: string, text: string): Promise<void>;
  followUp(sessionId: string, text: string): Promise<void>;
  abort(sessionId: string, reason?: string): Promise<void>;
  subscribe(sessionId: string, handler: RuntimeEventHandler): () => void;
  acquireLock(sessionId: string, owner: string): boolean;
  releaseLock(sessionId: string, owner: string): boolean;
  getProcessInfo?(sessionId: string): RuntimeProcessInfo | null;
  dispose?(): Promise<void>;
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
    const envelope: RealtimeEventDraft = {
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

  abstract prepare(session: RuntimeSessionContext): Promise<void>;
  abstract prompt(sessionId: string, input: SendMessageInput): Promise<void>;
  abstract steer(sessionId: string, text: string): Promise<void>;
  abstract followUp(sessionId: string, text: string): Promise<void>;
  abstract abort(sessionId: string, reason?: string): Promise<void>;
}

export class FakePiRuntime extends BaseRuntime implements PiRuntime {
  lastPreparedSession: RuntimeSessionContext | null = null;

  async prepare(session: RuntimeSessionContext): Promise<void> {
    this.lastPreparedSession = session;
  }

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
    this.emit(sessionId, 'queue.updated', { type: 'steer', text, pending: 1 });
  }

  async followUp(sessionId: string, text: string): Promise<void> {
    this.emit(sessionId, 'queue.updated', { type: 'follow_up', text, pending: 1 });
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
  agentDir?: string;
  defaultCwd?: string;
  sandbox?: PiSandboxOptions;
}

interface AdapterSessionState {
  client: PiRpcClient;
  started: Promise<void>;
}

/**
 * Real Pi CLI integration backed by a per-session `pi --mode rpc` child process.
 *
 * - One rpc client (and therefore one writer) per session. Persistent lock
 *   ownership belongs to RuntimeManager, which has the API-instance owner.
 * - subscribe() is inherited and fans mapped RealtimeEnvelopes to handlers; the
 *   raw pi events are translated via mapPiEventToEnvelope.
 * - prompt() resolves only after `agent_end`; streamed content remains available
 *   to subscribers while the run is active.
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
      agentDir: opts?.agentDir ?? process.env.PI_AGENT_DIR,
      defaultCwd: opts?.defaultCwd ?? process.env.PI_CWD,
      sandbox: opts?.sandbox,
    };
  }

  private ensureClient(
    sessionId: string,
    cwd?: string,
    agentsDir?: string,
    sessionPath?: string,
    resourceRoot?: string,
    allowedTools?: string[],
  ): AdapterSessionState {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    if (this.adapterOpts.sandbox?.mode === 'bwrap') {
      // bwrap bind-mounts these paths before Pi can create them itself.
      if (sessionPath) mkdirSync(dirname(sessionPath), { recursive: true });
      if (this.adapterOpts.agentDir) mkdirSync(this.adapterOpts.agentDir, { recursive: true });
    }
    const sandbox = createPiSandboxLaunch(this.adapterOpts.sandbox, {
      cwd: cwd ?? this.adapterOpts.defaultCwd ?? process.cwd(),
      sessionPath: sessionPath ?? '',
      agentDir: this.adapterOpts.agentDir,
      readOnlyWorkspace: Boolean(allowedTools),
    });
    // Pi resolves an existing session's cwd from its JSONL header. Keep it in
    // sync with the current worktree (or /workspace inside bwrap) before Pi
    // opens the session, otherwise a later Task can silently use the prior cwd.
    if (sessionPath) updatePiSessionCwd(sessionPath, sandbox.cwd);
    const client = new PiRpcClient({
      piBin: this.adapterOpts.piBin,
      nodeBin: this.adapterOpts.nodeBin,
      provider: this.adapterOpts.provider,
      model: this.adapterOpts.model,
      sessionPath: sandbox.sessionPath,
      args: [
        ...piResourceArgs(sandbox.resourceRoot, agentsDir),
        ...(allowedTools ? ['--tools', allowedTools.join(',')] : []),
        ...(this.adapterOpts.args ?? []),
      ],
      env: this.adapterOpts.env,
      agentDir: sandbox.agentDir,
      cwd: sandbox.cwd,
      command: sandbox.command,
      commandArgs: sandbox.commandArgs,
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

  async prepare(session: RuntimeSessionContext): Promise<void> {
    const state = this.ensureClient(
      session.sessionId,
      session.cwd,
      session.agentsDir,
      session.sessionPath,
      session.resourceRoot,
      session.allowedTools,
    );
    await state.started;
  }

  getProcessInfo(sessionId: string): RuntimeProcessInfo | null {
    return this.sessions.get(sessionId)?.client.getProcessInfo() ?? null;
  }

  async prompt(sessionId: string, input: SendMessageInput): Promise<void> {
    const state = this.ensureClient(sessionId);
    await state.started;
    const imageUris = input.attachments
      ?.filter((a) => a.kind === 'image')
      .map((a) => a.uri);
    const images = imageUris && imageUris.length > 0 ? imageUris : undefined;
    try {
      await state.client.prompt(input.text, images);
      await state.client.waitForIdle();
    } catch (err) {
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
    this.emit(sessionId, 'queue.updated', { type: 'steer', text, pending: 1 });
  }

  async followUp(sessionId: string, text: string): Promise<void> {
    const state = this.ensureClient(sessionId);
    await state.started;
    await state.client.followUp(text);
    this.emit(sessionId, 'queue.updated', { type: 'follow_up', text, pending: 1 });
  }

  async abort(sessionId: string, reason?: string): Promise<void> {
    const state = this.sessions.get(sessionId);
    if (state) {
      try {
        await state.client.abort();
        await state.client.waitForIdle(10_000).catch(async () => state.client.stop());
      } catch {
        await state.client.stop().catch(() => undefined);
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
