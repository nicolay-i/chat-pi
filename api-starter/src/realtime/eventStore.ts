import type { DatabaseSync } from 'node:sqlite';
import type { RealtimeEnvelope } from '@pi-agents/contracts';
import {
  createEventsRepository,
  type EventStream,
  type EventsRepository,
} from '../db/repositories/eventsRepository';

export type { EventStream } from '../db/repositories/eventsRepository';

/**
 * Delivery / idempotency contract:
 *
 * The server MAY redeliver an event on SSE reconnect. The `after` query param
 * (backed by `stream(..., afterId)`) minimizes re-delivery by replaying only
 * events strictly after the client's last-seen id, but it is a best-effort
 * optimization, not a guarantee. Ultimate dedup is the CLIENT's job: the
 * client reducer MUST be idempotent on `event.id` (see T05 eventReducer).
 * This server-side store is append-only and never mutates an event once
 * persisted, so `id` is a safe dedup key for the reducer.
 */
export type Listener = (env: RealtimeEnvelope) => void;

export type AppendEnvelope = Omit<RealtimeEnvelope, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
  projectId?: string;
  chatId?: string;
  taskId?: string;
  piSessionId?: string;
};

export function streamKey(stream: EventStream, streamId: string): string {
  return `${stream}:${streamId}`;
}

export interface EventStore {
  append(env: AppendEnvelope): Promise<RealtimeEnvelope>;
  stream(
    stream: EventStream,
    streamId: string,
    afterId?: string,
  ): RealtimeEnvelope[];
  subscribe(
    stream: EventStream,
    streamId: string,
    afterId: string | undefined,
    onChange: Listener,
  ): () => void;
}

export function createEventStore(db: DatabaseSync): EventStore {
  const repo: EventsRepository = createEventsRepository(db);
  const listeners = new Map<string, Set<Listener>>();

  const notify = (env: RealtimeEnvelope): void => {
    const key = streamKey(env.stream, env.streamId);
    const set = listeners.get(key);
    if (!set) return;
    for (const fn of set) fn(env);
  };

  return {
    async append(env) {
      const stream = env.stream;
      const chatId = env.chatId ?? (stream === 'chat' ? env.streamId : null);
      const taskId = env.taskId ?? (stream === 'task' ? env.streamId : null);
      const projectId = env.projectId ?? env.streamId;
      const persisted = repo.append({
        projectId,
        chatId,
        taskId,
        piSessionId: env.piSessionId,
        source: stream,
        type: env.type,
        payload: env.payload,
      });
      notify(persisted);
      return persisted;
    },

    stream(stream, streamId, afterId) {
      if (stream === 'chat') return repo.listByChat(streamId, afterId);
      if (stream === 'task') return repo.listByTask(streamId, afterId);
      return repo.listByProject(streamId, afterId);
    },

    subscribe(stream, streamId, afterId, onChange) {
      void afterId;
      const key = streamKey(stream, streamId);
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(onChange);
      return () => {
        const s = listeners.get(key);
        if (!s) return;
        s.delete(onChange);
        if (s.size === 0) listeners.delete(key);
      };
    },
  };
}
