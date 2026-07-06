import type { DatabaseSync } from 'node:sqlite';
import { camelToSnake, nowIso, randomId } from '../util';

export type PiSessionRow = {
  id: string;
  project_id: string;
  chat_id: string | null;
  task_id: string | null;
  path: string;
  cwd: string;
  active_leaf_entry_id: string | null;
  last_imported_offset: number;
  last_entry_id: string | null;
  lock_owner: string | null;
  lock_heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PiSessionRecord = {
  id: string;
  projectId: string;
  chatId: string | null;
  taskId: string | null;
  path: string;
  cwd: string;
  activeLeafEntryId: string | null;
  lastImportedOffset: number;
  lastEntryId: string | null;
  lockOwner: string | null;
  lockHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PiSessionInput = {
  projectId: string;
  chatId?: string | null;
  taskId?: string | null;
  path: string;
  cwd?: string;
  activeLeafEntryId?: string | null;
  lastImportedOffset?: number;
  lastEntryId?: string | null;
};

export type PiSessionPatch = Partial<{
  lastImportedOffset: number;
  lastEntryId: string | null;
  activeLeafEntryId: string | null;
  lockOwner: string | null;
  lockHeartbeatAt: string | null;
}>;

function rowToRecord(row: PiSessionRow): PiSessionRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    chatId: row.chat_id,
    taskId: row.task_id,
    path: row.path,
    cwd: row.cwd,
    activeLeafEntryId: row.active_leaf_entry_id,
    lastImportedOffset: row.last_imported_offset,
    lastEntryId: row.last_entry_id,
    lockOwner: row.lock_owner,
    lockHeartbeatAt: row.lock_heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type PiSessionsRepository = {
  create(input: PiSessionInput): PiSessionRecord;
  getById(id: string): PiSessionRecord | undefined;
  getByPath(path: string): PiSessionRecord | undefined;
  update(id: string, patch: PiSessionPatch): PiSessionRecord | undefined;
  acquireLock(id: string, owner: string): boolean;
  releaseLock(id: string, owner: string): boolean;
  list(): PiSessionRecord[];
};

export function createPiSessionsRepository(db: DatabaseSync): PiSessionsRepository {
  return {
    create(input) {
      const id = randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO pi_sessions
           (id, project_id, chat_id, task_id, path, cwd, active_leaf_entry_id,
            last_imported_offset, last_entry_id, lock_owner, lock_heartbeat_at,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.projectId,
        input.chatId ?? null,
        input.taskId ?? null,
        input.path,
        input.cwd ?? '',
        input.activeLeafEntryId ?? null,
        input.lastImportedOffset ?? 0,
        input.lastEntryId ?? null,
        null,
        null,
        now,
        now,
      );
      const row = db.prepare('SELECT * FROM pi_sessions WHERE id = ?').get(id) as PiSessionRow;
      return rowToRecord(row);
    },
    getById(id) {
      const row = db
        .prepare('SELECT * FROM pi_sessions WHERE id = ?')
        .get(id) as PiSessionRow | undefined;
      return row ? rowToRecord(row) : undefined;
    },
    getByPath(path) {
      const row = db
        .prepare('SELECT * FROM pi_sessions WHERE path = ?')
        .get(path) as PiSessionRow | undefined;
      return row ? rowToRecord(row) : undefined;
    },
    update(id, patch) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      const now = nowIso();
      if (entries.length === 0) {
        db.prepare('UPDATE pi_sessions SET updated_at = ? WHERE id = ?').run(now, id);
      } else {
        const setCols = entries.map(([k]) => `${camelToSnake(k)} = ?`);
        const vals = entries.map(([, v]) => v);
        setCols.push('updated_at = ?');
        vals.push(now);
        vals.push(id);
        db.prepare(`UPDATE pi_sessions SET ${setCols.join(', ')} WHERE id = ?`).run(...vals);
      }
      return this.getById(id);
    },
    acquireLock(id, owner) {
      const row = db
        .prepare('SELECT lock_owner FROM pi_sessions WHERE id = ?')
        .get(id) as { lock_owner: string | null } | undefined;
      if (!row) return false;
      if (row.lock_owner !== null && row.lock_owner !== owner) return false;
      const now = nowIso();
      db.prepare(
        'UPDATE pi_sessions SET lock_owner = ?, lock_heartbeat_at = ?, updated_at = ? WHERE id = ?',
      ).run(owner, now, now, id);
      return true;
    },
    releaseLock(id, owner) {
      const row = db
        .prepare('SELECT lock_owner FROM pi_sessions WHERE id = ?')
        .get(id) as { lock_owner: string | null } | undefined;
      if (!row || row.lock_owner !== owner) return false;
      const now = nowIso();
      db.prepare(
        'UPDATE pi_sessions SET lock_owner = NULL, lock_heartbeat_at = NULL, updated_at = ? WHERE id = ?',
      ).run(now, id);
      return true;
    },
    list() {
      const rows = db
        .prepare('SELECT * FROM pi_sessions ORDER BY created_at ASC')
        .all() as unknown as PiSessionRow[];
      return rows.map(rowToRecord);
    },
  };
}
