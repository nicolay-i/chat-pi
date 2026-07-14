import { Hono } from 'hono';
import { join } from 'node:path';
import { SendMessageInputSchema, TaskCancelInputSchema, TaskStatusSchema } from '@pi-agents/contracts';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const taskRouteOperationIds = [
  'tasks.list', 'tasks.get', 'tasks.steer', 'tasks.followUp', 'tasks.abort', 'tasks.abortAndReplace',
  'tasks.fork', 'tasks.rollback', 'tasks.archive', 'tasks.cancel', 'checkpoints.list', 'checkpoints.create',
  'checkpoints.fork', 'checkpoints.rollback', 'tasks.fetch', 'tasks.push', 'tasks.merge', 'diff.list', 'checkpoints.diff',
  'diff.file', 'tasks.rebase', 'diff.revertFile', 'tasks.trace',
] as const;

export function createTaskRoutes({ taskService, chatService, runtimeManager, taskRecords, projectRecords, piSessionRecords, checkpointService, forkService, rollbackService, mergeService, taskCancellationService, gitTaskService, eventStore }: ServiceContainer): Hono {
  const routes = new Hono();
  const includeChangedFiles = async <T extends { id: string; changedFiles: number }>(task: T): Promise<T> => {
    try {
      const diff = await gitTaskService.listDiff(task.id);
      return { ...task, changedFiles: diff.length };
    } catch {
      // Historical discarded tasks no longer have a worktree. Keep their
      // persisted summary available instead of failing the whole metadata API.
      return task;
    }
  };
  const contextFor = (taskId: string) => {
    const task = taskRecords.getById(taskId);
    const project = task ? projectRecords.getById(task.projectId) : undefined;
    return task && project ? { task, project } : undefined;
  };
  const forkIntoNewChat = async (taskId: string, checkpointId?: string) => {
    const context = contextFor(taskId);
    if (!context) throw new Error('task not found');
    if (['queued', 'running', 'aborting', 'merge_running'].includes(context.task.status)) {
      throw new Error(`fork disabled while task is ${context.task.status}`);
    }
    const checkpoint = checkpointId
      ? checkpointService.getCheckpoint(context.task.id, checkpointId)
      : checkpointService.listCheckpoints(context.task.id).at(-1);
    if (!checkpoint) throw new Error('fork requires a stable checkpoint');
    const chat = await chatService.create(context.project.id, {
      title: `${context.task.title} (fork)`,
      mode: 'implementation',
    });
    const sourceSessionPath = (context.task.piSessionId
      ? piSessionRecords.getById(context.task.piSessionId)?.path
      : undefined) ?? context.task.piSessionPath;
    const result = await forkService.forkFromCheckpoint({
      taskId: context.task.id,
      checkpointId: checkpoint.id,
      newTaskId: crypto.randomUUID(),
      repoPath: context.project.repoPath,
      runtimePath: context.project.runtimeStatePath,
      sourceChatId: chat.id,
      piSessionId: chat.piSessionId,
      piSessionPath: join(context.project.runtimeStatePath, 'sessions', `${chat.id}.jsonl`),
      clonePiSessionPath: sourceSessionPath,
      pendingPiForkEntryId: checkpoint.piEntryId,
    });
    await chatService.update(chat.id, { activeTaskId: result.task.id });
    return result.task;
  };
  routes.get('/api/projects/:id/tasks', async (c) => {
    const tasks = await taskService.listByProject(c.req.param('id'));
    return c.json(await Promise.all(tasks.map(includeChangedFiles)));
  });
  routes.get('/api/tasks/:id', async (c) => {
    const task = await taskService.get(c.req.param('id'));
    return task ? c.json(await includeChangedFiles(task)) : sendApiError(c, 404, 'not_found', 'task not found');
  });
  routes.get('/api/tasks/:id/trace', (c) => {
    const task = taskRecords.getById(c.req.param('id'));
    return task ? c.json(eventStore.stream('task', task.id)) : sendApiError(c, 404, 'not_found', 'task not found');
  });
  routes.patch('/api/tasks/:id', async (c) => {
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    let status;
    try { status = TaskStatusSchema.parse(body.status); }
    catch (error) { return sendApiError(c, 400, 'invalid_input', (error as Error).message); }
    try { return c.json(await taskService.updateStatus(c.req.param('id'), status)); }
    catch (error) { return sendApiError(c, 400, 'invalid_transition', (error as Error).message); }
  });
  routes.post('/api/tasks/:id/steer', async (c) => {
    const input = SendMessageInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { await runtimeManager.steer(c.req.param('id'), input.data.text); }
    catch (error) { return sendApiError(c, 409, 'task_not_running', (error as Error).message); }
    return c.json({ ok: true });
  });
  routes.post('/api/tasks/:id/follow-up', async (c) => {
    const input = SendMessageInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { await runtimeManager.followUp(c.req.param('id'), input.data.text); }
    catch (error) { return sendApiError(c, 409, 'task_not_running', (error as Error).message); }
    return c.json({ ok: true });
  });
  routes.post('/api/tasks/:id/abort', async (c) => {
    try { await runtimeManager.abort(c.req.param('id'), 'user'); }
    catch (error) { return sendApiError(c, 409, 'task_not_running', (error as Error).message); }
    return c.json({ ok: true });
  });
  routes.post('/api/tasks/:id/abort-and-replace', async (c) => {
    const input = SendMessageInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    const context = contextFor(c.req.param('id'));
    if (!context) return sendApiError(c, 404, 'not_found', 'task not found');
    const taskRef = { id: context.task.id, projectId: context.task.projectId, chatId: context.task.sourceChatId };
    void runtimeManager.abortAndReplace(taskRef, { ...input.data, behavior: 'abort_and_replace' }).catch(() => undefined);
    return c.json({ ok: true });
  });
  routes.post('/api/tasks/:id/fork', async (c) => {
    try {
      return c.json(await forkIntoNewChat(c.req.param('id')), 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendApiError(c, message === 'task not found' ? 404 : 409, 'fork_failed', message);
    }
  });
  routes.post('/api/tasks/:id/rollback', async (c) => {
    const context = contextFor(c.req.param('id'));
    if (!context) return sendApiError(c, 404, 'not_found', 'task not found');
    const body = await c.req.json().catch(() => ({} as { checkpointId?: unknown }));
    if (body.checkpointId !== undefined && typeof body.checkpointId !== 'string') {
      return sendApiError(c, 400, 'invalid_input', 'checkpointId must be a string');
    }
    const checkpoint = body.checkpointId
      ? checkpointService.getCheckpoint(context.task.id, body.checkpointId)
      : checkpointService.listCheckpoints(context.task.id).at(-1);
    if (!checkpoint) return sendApiError(c, 409, 'checkpoint_required', 'rollback requires a stable checkpoint');
    try {
      const result = await rollbackService.rollbackToCheckpoint({
        taskId: context.task.id,
        checkpointId: checkpoint.id,
        repoPath: context.project.repoPath,
        runtimePath: context.project.runtimeStatePath,
      });
      const task = await taskService.get(result.newTaskId);
      return task ? c.json(task, 201) : sendApiError(c, 500, 'rollback_failed', 'rollback task was not created');
    } catch (error) {
      return sendApiError(c, 409, 'rollback_failed', (error as Error).message);
    }
  });
  routes.post('/api/tasks/:id/archive', async (c) => {
    const context = contextFor(c.req.param('id'));
    if (!context) return sendApiError(c, 404, 'not_found', 'task not found');
    try {
      return c.json(await taskService.updateStatus(context.task.id, 'archived'));
    } catch (error) {
      return sendApiError(c, 409, 'archive_failed', (error as Error).message);
    }
  });
  routes.post('/api/tasks/:id/cancel', async (c) => {
    const input = TaskCancelInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(await taskCancellationService.cancel(c.req.param('id'), input.data.mode)); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendApiError(c, message.startsWith('task not found') ? 404 : 409, 'cancel_failed', message);
    }
  });
  routes.get('/api/tasks/:id/checkpoints', (c) => c.json(checkpointService.listCheckpoints(c.req.param('id'))));
  routes.post('/api/tasks/:id/checkpoints', async (c) => {
    const body = await c.req.json().catch(() => null) as { message?: unknown } | null;
    if (!body || typeof body.message !== 'string' || !body.message.trim()) return sendApiError(c, 400, 'invalid_input', 'message is required');
    const context = contextFor(c.req.param('id'));
    if (!context) return sendApiError(c, 404, 'not_found', 'task not found');
    try { return c.json(await checkpointService.createCheckpoint({ taskId: context.task.id, message: body.message.trim(), repoPath: context.project.repoPath, worktreePath: context.task.worktreePath, runtimeStatePath: context.project.runtimeStatePath }), 201); }
    catch (error) { return sendApiError(c, 409, 'checkpoint_failed', (error as Error).message); }
  });
  routes.post('/api/tasks/:id/checkpoints/:checkpointId/fork', async (c) => {
    try { return c.json(await forkIntoNewChat(c.req.param('id'), c.req.param('checkpointId')), 201); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendApiError(c, message === 'task not found' ? 404 : 409, 'fork_failed', message);
    }
  });
  routes.post('/api/tasks/:id/checkpoints/:checkpointId/rollback', async (c) => {
    const context = contextFor(c.req.param('id'));
    if (!context) return sendApiError(c, 404, 'not_found', 'task not found');
    try {
      const result = await rollbackService.rollbackToCheckpoint({ taskId: context.task.id, checkpointId: c.req.param('checkpointId'), repoPath: context.project.repoPath, runtimePath: context.project.runtimeStatePath });
      const task = await taskService.get(result.newTaskId);
      return task ? c.json(task, 201) : sendApiError(c, 500, 'rollback_failed', 'rollback task was not created');
    }
    catch (error) { return sendApiError(c, 409, 'rollback_failed', (error as Error).message); }
  });
  routes.post('/api/tasks/:id/merge', async (c) => {
    const body = await c.req.json().catch(() => null) as { strategy?: unknown; commitMessage?: unknown } | null;
    if (!body || body.strategy !== 'squash' || typeof body.commitMessage !== 'string' || !body.commitMessage.trim()) return sendApiError(c, 400, 'invalid_input', 'strategy must be squash and commitMessage is required');
    const context = contextFor(c.req.param('id'));
    if (!context) return sendApiError(c, 404, 'not_found', 'task not found');
    try {
      await mergeService.mergeTask({ taskId: context.task.id, strategy: body.strategy, commitMessage: body.commitMessage.trim(), repoPath: context.project.repoPath, runtimePath: context.project.runtimeStatePath });
      const task = await taskService.get(context.task.id);
      return task
        ? c.json(await includeChangedFiles(task))
        : sendApiError(c, 500, 'merge_failed', 'merged task was not found');
    }
    catch (error) { return sendApiError(c, 409, 'merge_failed', (error as Error).message); }
  });
  routes.get('/api/tasks/:id/diff', async (c) => {
    try { return c.json(await gitTaskService.listDiff(c.req.param('id'))); }
    catch (error) { return sendApiError(c, 404, 'diff_failed', (error as Error).message); }
  });
  routes.get('/api/tasks/:id/checkpoints/:checkpointId/diff', async (c) => {
    const checkpoint = checkpointService.getCheckpoint(c.req.param('id'), c.req.param('checkpointId'));
    if (!checkpoint?.sha) return sendApiError(c, 404, 'not_found', 'checkpoint not found');
    try { return c.json(await gitTaskService.listDiffSince(c.req.param('id'), checkpoint.sha)); }
    catch (error) { return sendApiError(c, 404, 'diff_failed', (error as Error).message); }
  });
  routes.get('/api/tasks/:id/diff/files/:path', async (c) => {
    try { return c.json(await gitTaskService.getDiffFile(c.req.param('id'), c.req.param('path'))); }
    catch (error) { return sendApiError(c, 404, 'diff_failed', (error as Error).message); }
  });
  routes.post('/api/tasks/:id/rebase', async (c) => {
    try { await gitTaskService.rebase(c.req.param('id')); return c.json(await taskService.get(c.req.param('id'))); }
    catch (error) { return sendApiError(c, 409, 'rebase_failed', (error as Error).message); }
  });
  routes.post('/api/tasks/:id/fetch', async (c) => {
    try { await gitTaskService.fetch(c.req.param('id')); return c.json(await taskService.get(c.req.param('id'))); }
    catch (error) { return sendApiError(c, 409, 'fetch_failed', (error as Error).message); }
  });
  routes.post('/api/tasks/:id/push', async (c) => {
    try { await gitTaskService.push(c.req.param('id')); return c.json(await taskService.get(c.req.param('id'))); }
    catch (error) { return sendApiError(c, 409, 'push_failed', (error as Error).message); }
  });
  routes.post('/api/tasks/:id/revert-file', async (c) => {
    const body = await c.req.json().catch(() => null) as { path?: unknown; confirm?: unknown } | null;
    if (!body || typeof body.path !== 'string' || body.confirm !== true) return sendApiError(c, 400, 'invalid_input', 'path and explicit confirmation are required');
    try {
      await gitTaskService.revertFile(c.req.param('id'), body.path);
      const task = await taskService.get(c.req.param('id'));
      return task ? c.json(task) : sendApiError(c, 404, 'not_found', 'task not found');
    } catch (error) { return sendApiError(c, 409, 'revert_failed', (error as Error).message); }
  });
  return routes;
}
