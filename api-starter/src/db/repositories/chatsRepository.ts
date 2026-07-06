import type { DatabaseSync } from 'node:sqlite';
import type { RunMode } from '@pi-agents/contracts';
import { camelToSnake, nowIso, randomId } from '../util';

export type ChatRow = {
  id: string;
  project_id: string;
  title: string;
  mode: string;
  active_task_id: string | null;
  active_pi_session_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatRecord = {
  id: string;
  projectId: string;
  title: string;
  mode: RunMode;
  activeTaskId: string | null;
  activePiSessionId: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatInput = {
  projectId: string;
  title: string;
  mode: RunMode;
  activeTaskId?: string | null;
  activePiSessionId?: string | null;
};

export type ChatPatch = Partial<Omit<ChatInput, 'projectId'>>;

function rowToChat(row: ChatRow): ChatRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    mode: row.mode as RunMode,
    activeTaskId: row.active_task_id,
    activePiSessionId: row.active_pi_session_id,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ChatsRepository = {
  create(input: ChatInput): ChatRecord;
  getById(id: string): ChatRecord | undefined;
  listByProject(projectId: string): ChatRecord[];
  update(id: string, patch: ChatPatch): ChatRecord | undefined;
  archive(id: string): ChatRecord | undefined;
};

export function createChatsRepository(db: DatabaseSync): ChatsRepository {
  return {
    create(input) {
      const id = randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO chats (id, project_id, title, mode, active_task_id, active_pi_session_id, archived_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.projectId,
        input.title,
        input.mode,
        input.activeTaskId ?? null,
        input.activePiSessionId ?? null,
        null,
        now,
        now,
      );
      return {
        id,
        projectId: input.projectId,
        title: input.title,
        mode: input.mode,
        activeTaskId: input.activeTaskId ?? null,
        activePiSessionId: input.activePiSessionId ?? null,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    },
    getById(id) {
      const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined;
      return row ? rowToChat(row) : undefined;
    },
    listByProject(projectId) {
      const rows = db
        .prepare('SELECT * FROM chats WHERE project_id = ? ORDER BY created_at ASC')
        .all(projectId) as unknown as ChatRow[];
      return rows.map(rowToChat);
    },
    update(id, patch) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      const now = nowIso();
      if (entries.length === 0) {
        db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, id);
      } else {
        const setCols = entries.map(([k]) => `${camelToSnake(k)} = ?`);
        const vals = entries.map(([, v]) => v);
        setCols.push('updated_at = ?');
        vals.push(now);
        vals.push(id);
        db.prepare(`UPDATE chats SET ${setCols.join(', ')} WHERE id = ?`).run(...vals);
      }
      return this.getById(id);
    },
    archive(id) {
      const now = nowIso();
      db.prepare('UPDATE chats SET archived_at = ?, updated_at = ? WHERE id = ?').run(now, now, id);
      return this.getById(id);
    },
  };
}
