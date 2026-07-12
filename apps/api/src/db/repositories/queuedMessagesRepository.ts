import type { DatabaseSync } from 'node:sqlite';
import { nowIso, randomId } from '../util';

export type QueuedMessageStatus = 'pending' | 'delivered' | 'removed';

type QueuedMessageRow = {
  id: string;
  chat_id: string;
  task_id: string | null;
  kind: 'follow_up';
  text: string;
  position: number;
  status: QueuedMessageStatus;
  created_at: string;
  updated_at: string;
};

export type QueuedMessageRecord = {
  id: string;
  chatId: string;
  taskId: string | null;
  kind: 'follow_up';
  text: string;
  position: number;
  status: QueuedMessageStatus;
  createdAt: string;
  updatedAt: string;
};

function rowToRecord(row: QueuedMessageRow): QueuedMessageRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    taskId: row.task_id,
    kind: row.kind,
    text: row.text,
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type QueuedMessagesRepository = {
  enqueue(input: { chatId: string; taskId?: string | null; text: string }): QueuedMessageRecord;
  listPending(chatId: string): QueuedMessageRecord[];
  markDelivered(id: string): boolean;
  remove(chatId: string, id: string): boolean;
  clear(chatId: string): number;
  reorder(chatId: string, ids: string[]): QueuedMessageRecord[];
};

export function createQueuedMessagesRepository(db: DatabaseSync): QueuedMessagesRepository {
  const listPending = (chatId: string): QueuedMessageRecord[] => {
    const rows = db.prepare(
      "SELECT * FROM queued_messages WHERE chat_id = ? AND status = 'pending' ORDER BY position ASC, created_at ASC",
    ).all(chatId) as unknown as QueuedMessageRow[];
    return rows.map(rowToRecord);
  };

  return {
    enqueue(input) {
      const id = randomId();
      const now = nowIso();
      const position = Number(
        (db.prepare(
          "SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM queued_messages WHERE chat_id = ? AND status = 'pending'",
        ).get(input.chatId) as { next_position: number }).next_position,
      );
      db.prepare(
        `INSERT INTO queued_messages (id, chat_id, task_id, kind, text, position, status, created_at, updated_at)
         VALUES (?, ?, ?, 'follow_up', ?, ?, 'pending', ?, ?)`,
      ).run(id, input.chatId, input.taskId ?? null, input.text, position, now, now);
      return rowToRecord(db.prepare('SELECT * FROM queued_messages WHERE id = ?').get(id) as QueuedMessageRow);
    },
    listPending,
    markDelivered(id) {
      const now = nowIso();
      return Number(db.prepare(
        "UPDATE queued_messages SET status = 'delivered', updated_at = ? WHERE id = ? AND status = 'pending'",
      ).run(now, id).changes) > 0;
    },
    remove(chatId, id) {
      const now = nowIso();
      return Number(db.prepare(
        "UPDATE queued_messages SET status = 'removed', updated_at = ? WHERE id = ? AND chat_id = ? AND status = 'pending'",
      ).run(now, id, chatId).changes) > 0;
    },
    clear(chatId) {
      const now = nowIso();
      return Number(db.prepare(
        "UPDATE queued_messages SET status = 'removed', updated_at = ? WHERE chat_id = ? AND status = 'pending'",
      ).run(now, chatId).changes);
    },
    reorder(chatId, ids) {
      const current = listPending(chatId);
      if (ids.length !== current.length || new Set(ids).size !== ids.length || ids.some((id) => !current.some((item) => item.id === id))) {
        throw new Error('queue reorder must contain every pending message exactly once');
      }
      const now = nowIso();
      for (const [index, id] of ids.entries()) {
        db.prepare('UPDATE queued_messages SET position = ?, updated_at = ? WHERE id = ? AND chat_id = ?')
          .run(index + 1, now, id, chatId);
      }
      return listPending(chatId);
    },
  };
}
