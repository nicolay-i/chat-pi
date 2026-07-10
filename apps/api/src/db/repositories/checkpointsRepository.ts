import type { DatabaseSync } from 'node:sqlite';
import type { Checkpoint } from '@pi-agents/contracts';
import { nowIso, randomId } from '../util';

export type CheckpointRow = {
  id: string;
  task_id: string;
  pi_session_id: string | null;
  pi_entry_id: string | null;
  before_sha: string | null;
  after_sha: string | null;
  patch_path: string | null;
  summary: string | null;
  created_at: string;
};

export type CheckpointInput = {
  id?: string;
  taskId: string;
  piSessionId?: string | null;
  piEntryId?: string | null;
  beforeSha?: string | null;
  afterSha?: string | null;
  patchPath?: string | null;
  summary?: string | null;
};

export type CheckpointPatch = {
  beforeSha?: string | null;
  afterSha?: string | null;
  patchPath?: string | null;
  summary?: string | null;
  piSessionId?: string | null;
  piEntryId?: string | null;
};

function rowToCheckpoint(row: CheckpointRow): Checkpoint {
  return {
    id: row.id,
    taskId: row.task_id,
    message: row.summary ?? '',
    sha: row.after_sha ?? undefined,
    changedFiles: 0,
    createdAt: row.created_at,
  };
}

export type CheckpointsRepository = {
  create(input: CheckpointInput): Checkpoint;
  getById(id: string): Checkpoint | undefined;
  listByTask(taskId: string): Checkpoint[];
  update(id: string, patch: CheckpointPatch): Checkpoint | undefined;
};

export function createCheckpointsRepository(db: DatabaseSync): CheckpointsRepository {
  return {
    create(input) {
      const id = input.id ?? randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO task_checkpoints (id, task_id, pi_session_id, pi_entry_id, before_sha, after_sha, patch_path, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.taskId,
        input.piSessionId ?? null,
        input.piEntryId ?? null,
        input.beforeSha ?? null,
        input.afterSha ?? null,
        input.patchPath ?? null,
        input.summary ?? null,
        now,
      );
      return {
        id,
        taskId: input.taskId,
        message: input.summary ?? '',
        sha: input.afterSha ?? undefined,
        changedFiles: 0,
        createdAt: now,
      };
    },
    getById(id) {
      const row = db
        .prepare('SELECT * FROM task_checkpoints WHERE id = ?')
        .get(id) as CheckpointRow | undefined;
      return row ? rowToCheckpoint(row) : undefined;
    },
    listByTask(taskId) {
      const rows = db
        .prepare('SELECT * FROM task_checkpoints WHERE task_id = ? ORDER BY created_at ASC, id ASC')
        .all(taskId) as unknown as CheckpointRow[];
      return rows.map(rowToCheckpoint);
    },
    update(id, patch) {
      const sets: string[] = [];
      const vals: (string | null)[] = [];
      if (patch.beforeSha !== undefined) {
        sets.push('before_sha = ?');
        vals.push(patch.beforeSha);
      }
      if (patch.afterSha !== undefined) {
        sets.push('after_sha = ?');
        vals.push(patch.afterSha);
      }
      if (patch.patchPath !== undefined) {
        sets.push('patch_path = ?');
        vals.push(patch.patchPath);
      }
      if (patch.summary !== undefined) {
        sets.push('summary = ?');
        vals.push(patch.summary);
      }
      if (patch.piSessionId !== undefined) {
        sets.push('pi_session_id = ?');
        vals.push(patch.piSessionId);
      }
      if (patch.piEntryId !== undefined) {
        sets.push('pi_entry_id = ?');
        vals.push(patch.piEntryId);
      }
      if (sets.length > 0) {
        vals.push(id);
        db.prepare(`UPDATE task_checkpoints SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      }
      const row = db
        .prepare('SELECT * FROM task_checkpoints WHERE id = ?')
        .get(id) as CheckpointRow | undefined;
      return row ? rowToCheckpoint(row) : undefined;
    },
  };
}
