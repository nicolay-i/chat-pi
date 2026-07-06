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
  mergeTarget: string;
  currentHeadSha: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskInput = {
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
      const id = randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO tasks (id, project_id, source_chat_id, title, mode, status, base_branch, base_sha, branch_name, worktree_path, pi_session_path, merge_target, current_head_sha, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
