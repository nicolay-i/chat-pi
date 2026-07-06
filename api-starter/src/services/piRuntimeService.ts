import type { EventType, RealtimeEnvelope, SendMessageInput } from '@pi-agents/contracts';

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

const PI_ADAPTER_ERROR =
  'Pi runtime adapter not yet configured — set PI_BIN/PI_CONFIG';

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

/**
 * Placeholder for the real Pi CLI integration (B06 will flesh out JSONL sync).
 * Lock + subscription semantics mirror the fake runtime so orchestration glue
 * can be exercised; prompt/steer/followUp/abort throw until configured.
 */
export class PiRuntimeAdapter extends BaseRuntime implements PiRuntime {
  async prompt(_sessionId: string, _input: SendMessageInput): Promise<void> {
    throw new Error(PI_ADAPTER_ERROR);
  }
  async steer(_sessionId: string, _text: string): Promise<void> {
    throw new Error(PI_ADAPTER_ERROR);
  }
  async followUp(_sessionId: string, _text: string): Promise<void> {
    throw new Error(PI_ADAPTER_ERROR);
  }
  async abort(_sessionId: string, _reason?: string): Promise<void> {
    throw new Error(PI_ADAPTER_ERROR);
  }
}

export function createRuntime(mode: 'fake' | 'pi' = 'fake'): PiRuntime {
  return mode === 'pi' ? new PiRuntimeAdapter() : new FakePiRuntime();
}
