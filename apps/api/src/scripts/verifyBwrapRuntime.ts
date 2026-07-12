import { DatabaseSync } from 'node:sqlite';

type JsonRecord = Record<string, unknown>;

type TaskResponse = {
  id: string;
  status: string;
};

type ChatResponse = {
  id: string;
  activeTaskId?: string;
};

type RuntimeProcessRow = {
  sandbox_mode: string;
  status: string;
  command: string;
  cwd: string;
  exit_reason: string | null;
};

const apiUrl = (process.env.VERIFY_API_URL ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const projectRepoPath = process.env.VERIFY_PROJECT_REPO_PATH?.trim();
const timeoutMs = Number(process.env.VERIFY_TIMEOUT_SECONDS ?? '1200') * 1_000;
const pollIntervalMs = 1_000;

if (!projectRepoPath?.startsWith('/projects/')) {
  throw new Error('VERIFY_PROJECT_REPO_PATH must be an existing container path under /projects');
}
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 86_400_000) {
  throw new Error('VERIFY_TIMEOUT_SECONDS must be an integer between 30 and 86400');
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed (${response.status}): ${body}`);
  return body ? JSON.parse(body) as T : undefined as T;
}

async function waitForTask(taskId: string): Promise<TaskResponse> {
  const deadline = Date.now() + timeoutMs;
  let latest: TaskResponse | undefined;
  while (Date.now() < deadline) {
    latest = await api<TaskResponse>(`/api/tasks/${taskId}`);
    if (latest.status === 'needs_review') return latest;
    if (['failed', 'paused_clean', 'paused_dirty', 'paused_after_restart', 'cancelled_archived', 'cancelled_discarded'].includes(latest.status)) {
      throw new Error(`Pi turn stopped in terminal status ${latest.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
  throw new Error(`Task ${taskId} did not reach needs_review within ${timeoutMs / 1_000}s (last status: ${latest?.status ?? 'unknown'})`);
}

async function waitForAudit(db: DatabaseSync, taskId: string): Promise<RuntimeProcessRow> {
  const deadline = Date.now() + 10_000;
  let row: RuntimeProcessRow | undefined;
  while (Date.now() < deadline) {
    row = db.prepare(
      `SELECT sandbox_mode, status, command, cwd, exit_reason
       FROM runtime_processes
       WHERE task_id = ?
       ORDER BY started_at DESC
       LIMIT 1`,
    ).get(taskId) as RuntimeProcessRow | undefined;
    if (row && row.status !== 'running') return row;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return row ?? { sandbox_mode: 'missing', status: 'missing', command: '', cwd: '', exit_reason: null };
}

async function run(): Promise<void> {
  const projects = await api<Array<{ id: string; repoPath: string }>>('/api/projects');
  const project = projects.find((item) => item.repoPath === projectRepoPath);
  if (!project) {
    throw new Error(`No registered project uses ${projectRepoPath}. Create it in the application before running this verifier.`);
  }

  const dbPath = process.env.DB_PATH ?? '/data/app.db';
  const db = new DatabaseSync(dbPath);
  let chatId: string | undefined;
  let taskId: string | undefined;
  let primaryError: unknown;
  try {
    const chat = await api<ChatResponse>(`/api/projects/${project.id}/chats`, {
      method: 'POST',
      body: JSON.stringify({
        title: `bwrap verification ${new Date().toISOString()}`,
        mode: 'implementation',
        createTask: true,
      }),
    });
    chatId = chat.id;
    taskId = chat.activeTaskId;
    if (!taskId) throw new Error('Verifier Chat did not create an active Task');

    await api(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        behavior: 'send',
        text: 'Sandbox verification turn. Reply exactly: sandbox verification complete. Do not modify files.',
      }),
    });
    await waitForTask(taskId);
    const process = await waitForAudit(db, taskId);
    if (process.sandbox_mode !== 'bwrap' || process.status !== 'completed') {
      throw new Error(`Expected completed bwrap runtime process, got sandbox_mode=${process.sandbox_mode}, status=${process.status}, command=${process.command}, cwd=${process.cwd}, reason=${process.exit_reason ?? ''}`);
    }
    console.log(JSON.stringify({
      ok: true,
      taskId,
      sandboxMode: process.sandbox_mode,
      processStatus: process.status,
      command: process.command,
      cwd: process.cwd,
    }));
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (taskId) {
      try {
        const task = await api<TaskResponse>(`/api/tasks/${taskId}`);
        if (['queued', 'running', 'aborting'].includes(task.status)) {
          await api(`/api/tasks/${taskId}/abort`, { method: 'POST' });
          await waitForTask(taskId).catch(() => undefined);
        }
        const finalTask = await api<TaskResponse>(`/api/tasks/${taskId}`);
        if (!['cancelled_archived', 'cancelled_discarded', 'archived'].includes(finalTask.status)) {
          await api(`/api/tasks/${taskId}/cancel`, { method: 'POST', body: JSON.stringify({ mode: 'discard' }) });
        }
      } catch (cleanupError) {
        console.error(`Verifier cleanup failed for Task ${taskId}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        if (!primaryError) throw cleanupError;
      }
    }
    if (chatId) {
      try {
        await api(`/api/chats/${chatId}/archive`, { method: 'POST' });
      } catch (cleanupError) {
        console.error(`Verifier cleanup failed for Chat ${chatId}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        if (!primaryError) throw cleanupError;
      }
    }
    db.close();
  }
}

await run();
