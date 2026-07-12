import type { DatabaseSync } from 'node:sqlite';
import type { Checkpoint } from '@pi-agents/contracts';
import { nowIso, randomId } from '../util';

export type CheckpointRow = {
  id: string;
  task_id: string;
  chat_id: string | null;
  run_id: string | null;
  step_number: number | null;
  pi_session_id: string | null;
  pi_entry_id: string | null;
  before_sha: string | null;
  after_sha: string | null;
  patch_path: string | null;
  has_file_changes: number | null;
  changed_files: number | null;
  summary: string | null;
  created_at: string;
};

export type CheckpointInput = {
  id?: string;
  taskId: string;
  chatId?: string | null;
  runId?: string | null;
  stepNumber?: number | null;
  piSessionId?: string | null;
  piEntryId?: string | null;
  beforeSha?: string | null;
  afterSha?: string | null;
  patchPath?: string | null;
  hasFileChanges?: boolean;
  changedFiles?: number;
  summary?: string | null;
};

export type CheckpointPatch = {
  beforeSha?: string | null;
  afterSha?: string | null;
  patchPath?: string | null;
  summary?: string | null;
  piSessionId?: string | null;
  piEntryId?: string | null;
  chatId?: string | null;
  runId?: string | null;
  stepNumber?: number | null;
  hasFileChanges?: boolean;
  changedFiles?: number;
};

function rowToCheckpoint(row: CheckpointRow): Checkpoint {
  return {
    id: row.id,
    chatId: row.chat_id ?? '',
    taskId: row.task_id,
    runId: row.run_id ?? '',
    stepNumber: row.step_number ?? 1,
    piEntryId: row.pi_entry_id,
    beforeSha: row.before_sha ?? row.after_sha ?? '',
    afterSha: row.after_sha ?? row.before_sha ?? '',
    hasFileChanges: Boolean(row.has_file_changes),
    patchPath: row.patch_path,
    message: row.summary ?? '',
    sha: row.after_sha ?? undefined,
    changedFiles: row.changed_files ?? 0,
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
        `INSERT INTO task_checkpoints (id, task_id, chat_id, run_id, step_number, pi_session_id, pi_entry_id, before_sha, after_sha, patch_path, has_file_changes, changed_files, summary, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.taskId,
        input.chatId ?? null,
        input.runId ?? null,
        input.stepNumber ?? null,
        input.piSessionId ?? null,
        input.piEntryId ?? null,
        input.beforeSha ?? null,
        input.afterSha ?? null,
        input.patchPath ?? null,
        input.hasFileChanges === undefined ? null : Number(input.hasFileChanges),
        input.changedFiles ?? null,
        input.summary ?? null,
        now,
      );
      return this.getById(id)!;
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
      if (patch.chatId !== undefined) {
        sets.push('chat_id = ?');
        vals.push(patch.chatId);
      }
      if (patch.runId !== undefined) {
        sets.push('run_id = ?');
        vals.push(patch.runId);
      }
      if (patch.stepNumber !== undefined) {
        sets.push('step_number = ?');
        vals.push(String(patch.stepNumber));
      }
      if (patch.hasFileChanges !== undefined) {
        sets.push('has_file_changes = ?');
        vals.push(String(Number(patch.hasFileChanges)));
      }
      if (patch.changedFiles !== undefined) {
        sets.push('changed_files = ?');
        vals.push(String(patch.changedFiles));
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
