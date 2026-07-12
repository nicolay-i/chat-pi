import type { DatabaseSync } from 'node:sqlite';
import { nowIso, randomId } from '../util';

export type RuntimeProcessStatus = 'running' | 'completed' | 'aborted' | 'timed_out' | 'failed';

type RuntimeProcessRow = {
  id: string;
  project_id: string;
  chat_id: string | null;
  task_id: string | null;
  pi_session_id: string;
  run_id: string;
  pid: number | null;
  command: string;
  cwd: string;
  sandbox_mode: 'none' | 'bwrap';
  status: RuntimeProcessStatus;
  exit_reason: string | null;
  started_at: string;
  ended_at: string | null;
};

export type RuntimeProcessRecord = {
  id: string;
  projectId: string;
  chatId: string | null;
  taskId: string | null;
  piSessionId: string;
  runId: string;
  pid: number | null;
  command: string;
  cwd: string;
  sandboxMode: 'none' | 'bwrap';
  status: RuntimeProcessStatus;
  exitReason: string | null;
  startedAt: string;
  endedAt: string | null;
};

export type RuntimeProcessInput = Omit<RuntimeProcessRecord, 'id' | 'status' | 'exitReason' | 'startedAt' | 'endedAt'>;

function rowToRecord(row: RuntimeProcessRow): RuntimeProcessRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    chatId: row.chat_id,
    taskId: row.task_id,
    piSessionId: row.pi_session_id,
    runId: row.run_id,
    pid: row.pid,
    command: row.command,
    cwd: row.cwd,
    sandboxMode: row.sandbox_mode,
    status: row.status,
    exitReason: row.exit_reason,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

export type RuntimeProcessesRepository = {
  start(input: RuntimeProcessInput): RuntimeProcessRecord;
  finish(id: string, status: Exclude<RuntimeProcessStatus, 'running'>, exitReason?: string): RuntimeProcessRecord | undefined;
  finishAllRunning(status: Exclude<RuntimeProcessStatus, 'running'>, exitReason: string): number;
  listByTaskId(taskId: string): RuntimeProcessRecord[];
  listBySessionId(piSessionId: string): RuntimeProcessRecord[];
};

export function createRuntimeProcessesRepository(db: DatabaseSync): RuntimeProcessesRepository {
  const get = (id: string): RuntimeProcessRecord | undefined => {
    const row = db.prepare('SELECT * FROM runtime_processes WHERE id = ?').get(id) as RuntimeProcessRow | undefined;
    return row ? rowToRecord(row) : undefined;
  };

  const list = (column: 'task_id' | 'pi_session_id', value: string): RuntimeProcessRecord[] => {
    const rows = db.prepare(`SELECT * FROM runtime_processes WHERE ${column} = ? ORDER BY started_at ASC`)
      .all(value) as unknown as RuntimeProcessRow[];
    return rows.map(rowToRecord);
  };

  return {
    start(input) {
      const id = randomId();
      const startedAt = nowIso();
      db.prepare(
        `INSERT INTO runtime_processes
           (id, project_id, chat_id, task_id, pi_session_id, run_id, pid, command, cwd, sandbox_mode, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
      ).run(
        id, input.projectId, input.chatId, input.taskId, input.piSessionId, input.runId,
        input.pid, input.command, input.cwd, input.sandboxMode, startedAt,
      );
      return get(id)!;
    },
    finish(id, status, exitReason) {
      db.prepare(
        `UPDATE runtime_processes
         SET status = ?, exit_reason = ?, ended_at = ?
         WHERE id = ? AND status = 'running'`,
      ).run(status, exitReason ?? null, nowIso(), id);
      return get(id);
    },
    finishAllRunning(status, exitReason) {
      return Number(db.prepare(
        "UPDATE runtime_processes SET status = ?, exit_reason = ?, ended_at = ? WHERE status = 'running'",
      ).run(status, exitReason, nowIso()).changes);
    },
    listByTaskId(taskId) {
      return list('task_id', taskId);
    },
    listBySessionId(piSessionId) {
      return list('pi_session_id', piSessionId);
    },
  };
}
