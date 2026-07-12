import type { DatabaseSync } from 'node:sqlite';
import type { EventType, RealtimeEnvelope } from '@pi-agents/contracts';
import { nowIso } from '../util';

type SqlValue = string | number | bigint | null | Uint8Array;

export type ChatEventRow = {
  id: string;
  sequence: number;
  project_id: string;
  chat_id: string | null;
  task_id: string | null;
  pi_session_id: string | null;
  source: string;
  type: string;
  payload_json: string;
  created_at: string;
};

export type EventStream = 'project' | 'chat' | 'task';

export type ChatEventInput = {
  projectId: string;
  chatId?: string | null;
  taskId?: string | null;
  piSessionId?: string | null;
  source: EventStream;
  type: EventType;
  payload: unknown;
};

let ulidCounter = 0;

export function ulid(): string {
  const ts = Date.now().toString(36).padStart(9, '0');
  const c = (ulidCounter++).toString(36).padStart(6, '0');
  const rand = Math.random().toString(36).slice(2, 8).padStart(6, '0');
  return `${ts}${c}${rand}`;
}

export function eventRowToEnvelope(row: ChatEventRow): RealtimeEnvelope {
  const stream = row.source as RealtimeEnvelope['stream'];
  const streamId =
    stream === 'project'
      ? row.project_id
      : stream === 'chat'
        ? row.chat_id ?? row.project_id
        : row.task_id ?? row.project_id;
  return {
    id: row.id,
    sequence: row.sequence,
    stream,
    streamId,
    type: row.type as EventType,
    payload: JSON.parse(row.payload_json) as unknown,
    createdAt: row.created_at,
  };
}

export type EventsRepository = {
  append(input: ChatEventInput): RealtimeEnvelope;
  listByChat(chatId: string, afterSequence?: number): RealtimeEnvelope[];
  listByTask(taskId: string, afterSequence?: number): RealtimeEnvelope[];
  listByProject(projectId: string, afterSequence?: number): RealtimeEnvelope[];
};

export function createEventsRepository(db: DatabaseSync): EventsRepository {
  const listEvents = (
    where: string,
    params: SqlValue[],
    afterSequence?: number,
  ): RealtimeEnvelope[] => {
    const orderBy = ' ORDER BY sequence ASC';
    if (afterSequence === undefined) {
      const rows = db
        .prepare(`SELECT * FROM chat_events WHERE ${where}${orderBy}`)
        .all(...params) as unknown as ChatEventRow[];
      return rows.map(eventRowToEnvelope);
    }
    const rows = db
      .prepare(
        `SELECT * FROM chat_events WHERE ${where} AND sequence > ?${orderBy}`,
      )
      .all(...params, afterSequence) as unknown as ChatEventRow[];
    return rows.map(eventRowToEnvelope);
  };

  return {
    append(input) {
      const id = ulid();
      const now = nowIso();
      const sequence = Number(db.prepare('INSERT INTO event_sequences DEFAULT VALUES').run().lastInsertRowid);
      db.prepare(
        `INSERT INTO chat_events (id, sequence, project_id, chat_id, task_id, pi_session_id, source, type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        sequence,
        input.projectId,
        input.chatId ?? null,
        input.taskId ?? null,
        input.piSessionId ?? null,
        input.source,
        input.type,
        JSON.stringify(input.payload),
        now,
      );
      const streamId =
        input.source === 'project'
          ? input.projectId
          : input.source === 'chat'
            ? input.chatId ?? input.projectId
            : input.taskId ?? input.projectId;
      return {
        id,
        sequence,
        stream: input.source,
        streamId,
        type: input.type,
        payload: input.payload,
        createdAt: now,
      };
    },
    listByChat(chatId, afterSequence) {
      return listEvents('chat_id = ?', [chatId], afterSequence);
    },
    listByTask(taskId, afterSequence) {
      return listEvents('task_id = ?', [taskId], afterSequence);
    },
    listByProject(projectId, afterSequence) {
      return listEvents('project_id = ?', [projectId], afterSequence);
    },
  };
}
