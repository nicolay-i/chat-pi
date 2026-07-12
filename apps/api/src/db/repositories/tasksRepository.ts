import type { DatabaseSync } from 'node:sqlite';
import type { RunMode, TaskStatus } from '@pi-agents/contracts';
import { camelToSnake, nowIso, randomId } from '../util';

export type TaskRow = {
  id: string;
  project_id: string;
  source_chat_id: string | null;
  title: string;
  mode: string;
  status: string;
  base_branch: string;
  base_sha: string;
  branch_name: string;
  worktree_path: string;
  pi_session_path: string;
  pi_session_id: string | null;
  start_pi_entry_id: string | null;
  end_pi_entry_id: string | null;
  pending_pi_fork_entry_id: string | null;
  last_run_id: string | null;
  merge_target: string;
  current_head_sha: string | null;
  created_at: string;
  updated_at: string;
};

export type TaskRecord = {
  id: string;
  projectId: string;
  sourceChatId: string | null;
  title: string;
  mode: RunMode;
  status: TaskStatus;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  worktreePath: string;
  piSessionPath: string;
  piSessionId: string | null;
  startPiEntryId: string | null;
  endPiEntryId: string | null;
  pendingPiForkEntryId: string | null;
  lastRunId: string | null;
  mergeTarget: string;
  currentHeadSha: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
  id?: string;
  projectId: string;
  sourceChatId?: string | null;
  title: string;
  mode: RunMode;
  status: TaskStatus;
  baseBranch: string;
  baseSha: string;
  branchName: string;
  worktreePath: string;
  piSessionPath: string;
  piSessionId?: string | null;
  startPiEntryId?: string | null;
  endPiEntryId?: string | null;
  pendingPiForkEntryId?: string | null;
  lastRunId?: string | null;
  mergeTarget: string;
  currentHeadSha?: string | null;
};

export type TaskPatch = Partial<Omit<TaskInput, 'projectId'>>;

function rowToTask(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceChatId: row.source_chat_id,
    title: row.title,
    mode: row.mode as RunMode,
    status: row.status as TaskStatus,
    baseBranch: row.base_branch,
    baseSha: row.base_sha,
    branchName: row.branch_name,
    worktreePath: row.worktree_path,
    piSessionPath: row.pi_session_path,
    piSessionId: row.pi_session_id,
    startPiEntryId: row.start_pi_entry_id,
    endPiEntryId: row.end_pi_entry_id,
    pendingPiForkEntryId: row.pending_pi_fork_entry_id,
    lastRunId: row.last_run_id,
    mergeTarget: row.merge_target,
    currentHeadSha: row.current_head_sha,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type TasksRepository = {
  create(input: TaskInput): TaskRecord;
  getById(id: string): TaskRecord | undefined;
  listByProject(projectId: string): TaskRecord[];
  listByChatId(chatId: string): TaskRecord[];
  listByStatus(status: TaskStatus): TaskRecord[];
  updateStatus(id: string, status: TaskStatus): TaskRecord | undefined;
  update(id: string, patch: TaskPatch): TaskRecord | undefined;
};

export function createTasksRepository(db: DatabaseSync): TasksRepository {
  const bumpUpdatedAt = (id: string) => {
    db.prepare('UPDATE tasks SET updated_at = ? WHERE id = ?').run(nowIso(), id);
  };

  return {
    create(input) {
      const id = input.id ?? randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO tasks (id, project_id, source_chat_id, title, mode, status, base_branch, base_sha, branch_name, worktree_path, pi_session_path, pi_session_id, start_pi_entry_id, end_pi_entry_id, pending_pi_fork_entry_id, last_run_id, merge_target, current_head_sha, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.projectId,
        input.sourceChatId ?? null,
        input.title,
        input.mode,
        input.status,
        input.baseBranch,
        input.baseSha,
        input.branchName,
        input.worktreePath,
        input.piSessionPath,
        input.piSessionId ?? null,
        input.startPiEntryId ?? null,
        input.endPiEntryId ?? null,
        input.pendingPiForkEntryId ?? null,
        input.lastRunId ?? null,
        input.mergeTarget,
        input.currentHeadSha ?? null,
        now,
        now,
      );
      return {
        id,
        projectId: input.projectId,
        sourceChatId: input.sourceChatId ?? null,
        title: input.title,
        mode: input.mode,
        status: input.status,
        baseBranch: input.baseBranch,
        baseSha: input.baseSha,
        branchName: input.branchName,
        worktreePath: input.worktreePath,
        piSessionPath: input.piSessionPath,
        piSessionId: input.piSessionId ?? null,
        startPiEntryId: input.startPiEntryId ?? null,
        endPiEntryId: input.endPiEntryId ?? null,
        pendingPiForkEntryId: input.pendingPiForkEntryId ?? null,
        lastRunId: input.lastRunId ?? null,
        mergeTarget: input.mergeTarget,
        currentHeadSha: input.currentHeadSha ?? null,
        createdAt: now,
        updatedAt: now,
      };
    },
    getById(id) {
      const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow | undefined;
      return row ? rowToTask(row) : undefined;
    },
    listByProject(projectId) {
      const rows = db
        .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at ASC')
        .all(projectId) as unknown as TaskRow[];
      return rows.map(rowToTask);
    },
    listByChatId(chatId) {
      const rows = db
        .prepare('SELECT * FROM tasks WHERE source_chat_id = ? ORDER BY created_at ASC')
        .all(chatId) as unknown as TaskRow[];
      return rows.map(rowToTask);
    },
    listByStatus(status) {
      const rows = db
        .prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC')
        .all(status) as unknown as TaskRow[];
      return rows.map(rowToTask);
    },
    updateStatus(id, status) {
      const now = nowIso();
      db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
      return this.getById(id);
    },
    update(id, patch) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      if (entries.length === 0) {
        bumpUpdatedAt(id);
      } else {
        const setCols = entries.map(([k]) => `${camelToSnake(k)} = ?`);
        const vals = entries.map(([, v]) => v);
        setCols.push('updated_at = ?');
        vals.push(nowIso());
        vals.push(id);
        db.prepare(`UPDATE tasks SET ${setCols.join(', ')} WHERE id = ?`).run(...vals);
      }
      return this.getById(id);
    },
  };
}
