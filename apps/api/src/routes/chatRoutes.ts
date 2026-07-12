import { Hono } from 'hono';
import { CreateChatInputSchema, ManagedImplementationSchema, RunModeSchema, SendMessageInputSchema, TaskSchema } from '@pi-agents/contracts';
import { z } from 'zod';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';
import { config } from '../config';

export const chatRouteOperationIds = [
  'chats.list', 'chats.create', 'chats.bootstrap', 'chats.get', 'chats.update', 'chats.archive',
  'chats.export', 'chats.tree', 'chats.trace', 'messages.send', 'chats.abort',
  'orchestration.listManaged', 'orchestration.createTask',
  'tasks.createForChat',
  'queue.list', 'queue.reorder', 'queue.remove', 'queue.clear',
] as const;

const UpdateChatInputSchema = z.object({
  title: z.string().min(1).optional(),
  mode: RunModeSchema.optional(),
  activeTaskId: z.string().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'at least one field is required');

export function createChatRoutes({ projectService, chatService, taskService, eventStore, runtimeManager, queuedMessages }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.get('/api/projects/:id/chats', async (c) => c.json(await chatService.list(c.req.param('id'))));
  routes.post('/api/projects/:id/chats', async (c) => {
    let input;
    try { input = CreateChatInputSchema.parse(await c.req.json()); }
    catch (error) { return sendApiError(c, 400, 'invalid_input', (error as Error).message); }
    try { return c.json(await chatService.create(c.req.param('id'), input), 201); }
    catch (error) { return sendApiError(c, 500, 'create_failed', (error as Error).message); }
  });
  routes.post('/api/chats/bootstrap', async (c) => {
    const repoPath = config.agentCwd ?? process.cwd();
    let project = (await projectService.list()).find((item) => item.repoPath === repoPath);
    if (!project) project = await projectService.create({ name: 'Local workspace', repoPath, defaultBranch: 'main' });
    const chat = (await chatService.list(project.id))[0] ?? await chatService.create(project.id, { title: 'Новый чат', mode: 'discussion' });
    return c.json(chat, 201);
  });
  routes.get('/api/chats/:id', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    return chat ? c.json(chat) : sendApiError(c, 404, 'not_found', 'chat not found');
  });
  routes.patch('/api/chats/:id', async (c) => {
    const input = UpdateChatInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    const chat = await chatService.update(c.req.param('id'), input.data);
    return chat ? c.json(chat) : sendApiError(c, 404, 'not_found', 'chat not found');
  });
  routes.post('/api/chats/:id/archive', async (c) => {
    const chat = await chatService.archive(c.req.param('id'));
    return chat ? c.json(chat) : sendApiError(c, 404, 'not_found', 'chat not found');
  });
  routes.get('/api/chats/:id/tree', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    const tasks = await taskService.listByProject(chat.projectId);
    return c.json(tasks.filter((task) => task.sourceChatId === chat.id));
  });
  routes.get('/api/chats/:id/managed-implementations', async (c) => {
    try { return c.json((await chatService.listManagedImplementations(c.req.param('id'))).map((item) => ManagedImplementationSchema.parse(item))); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendApiError(c, message.startsWith('orchestration chat not found') ? 404 : 409, 'orchestration_failed', message);
    }
  });
  routes.post('/api/chats/:id/implementation-tasks', async (c) => {
    const input = z.object({ title: z.string().min(1) }).safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(ManagedImplementationSchema.parse(await chatService.createManagedImplementation(c.req.param('id'), input.data.title)), 201); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendApiError(c, message.startsWith('orchestration chat not found') ? 404 : 409, 'orchestration_failed', message);
    }
  });
  routes.post('/api/chats/:id/tasks', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    const input = z.object({ title: z.string().min(1), mode: RunModeSchema.default('implementation') })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success || input.data.mode !== 'implementation') {
      return sendApiError(c, 400, 'invalid_input', 'implementation title is required');
    }
    try {
      const task = await taskService.createForChat(chat.projectId, chat.id, input.data);
      await chatService.update(chat.id, { activeTaskId: task.id });
      return c.json(TaskSchema.parse(task), 201);
    } catch (error) {
      return sendApiError(c, 409, 'task_create_failed', error instanceof Error ? error.message : String(error));
    }
  });
  routes.get('/api/chats/:id/trace', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    return c.json(eventStore.stream('chat', chat.id));
  });
  routes.get('/api/chats/:id/queue', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    return chat ? c.json(queuedMessages.listPending(chat.id)) : sendApiError(c, 404, 'not_found', 'chat not found');
  });
  routes.patch('/api/chats/:id/queue', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    const input = z.object({ ids: z.array(z.string().min(1)) }).safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(queuedMessages.reorder(chat.id, input.data.ids)); }
    catch (error) { return sendApiError(c, 409, 'queue_reorder_failed', error instanceof Error ? error.message : String(error)); }
  });
  routes.delete('/api/chats/:chatId/queue/:itemId', async (c) => {
    const chat = await chatService.get(c.req.param('chatId'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    return queuedMessages.remove(chat.id, c.req.param('itemId'))
      ? c.json({ ok: true })
      : sendApiError(c, 404, 'not_found', 'pending queue item not found');
  });
  routes.post('/api/chats/:id/queue/clear', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    queuedMessages.clear(chat.id);
    return c.json({ ok: true });
  });
  routes.post('/api/chats/:id/export', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), chat, trace: eventStore.stream('chat', chat.id) });
    return c.json({ url: `data:application/json;charset=utf-8,${encodeURIComponent(payload)}` });
  });
  routes.post('/api/chats/:chatId/messages', async (c) => {
    const chatId = c.req.param('chatId');
    let input;
    try { input = SendMessageInputSchema.parse(await c.req.json()); }
    catch (error) { return sendApiError(c, 400, 'invalid_input', (error as Error).message); }
    const chat = await chatService.get(chatId);
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    const projectId = chat.projectId;
    await eventStore.append({
      stream: 'chat', streamId: chatId, projectId, chatId, type: 'message.created',
      payload: { chatId, id: input.clientMessageId ?? crypto.randomUUID(), role: 'user', text: input.text, createdAt: new Date().toISOString(), behavior: input.behavior },
    });
    if (chat.activeTaskId) {
      const task = await taskService.get(chat.activeTaskId);
      if (!task) return sendApiError(c, 409, 'task_missing', 'active task not found');
      const taskRef = { id: task.id, projectId: task.projectId, chatId };
      if (input.behavior === 'steer' || input.behavior === 'follow_up') {
        try {
          if (input.behavior === 'steer') await runtimeManager.steer(task.id, input.text);
          else await runtimeManager.followUp(task.id, input.text);
          return c.json({ ok: true, chatId, accepted: input.behavior, taskId: task.id });
        } catch (error) {
          return sendApiError(c, 409, 'task_not_running', (error as Error).message);
        }
      }
      const run = input.behavior === 'abort_and_replace'
        ? runtimeManager.abortAndReplace(taskRef, input)
        : runtimeManager.runTask(taskRef, input);
      void run.catch((error: unknown) => {
        void eventStore.append({
          stream: 'chat', streamId: chatId, projectId, chatId, taskId: task.id, type: 'run.error',
          payload: { chatId, message: error instanceof Error ? error.message : String(error) },
        });
      });
      return c.json({ ok: true, chatId, accepted: input.behavior, taskId: task.id });
    }
    void runtimeManager.runChat({ id: chatId, projectId }, input).catch((error: unknown) => {
      void eventStore.append({
        stream: 'chat', streamId: chatId, projectId, chatId, type: 'run.error',
        payload: { chatId, message: error instanceof Error ? error.message : String(error) },
      });
    });
    return c.json({ ok: true, chatId, accepted: input.behavior });
  });
  routes.post('/api/chats/:chatId/abort', async (c) => {
    const chatId = c.req.param('chatId');
    const chat = await chatService.get(chatId);
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    if (chat.activeTaskId) {
      try { await runtimeManager.abort(chat.activeTaskId, 'user'); }
      catch (error) { return sendApiError(c, 409, 'task_not_running', (error as Error).message); }
      return c.json({ ok: true });
    }
    try { await runtimeManager.abort(chatId, 'user'); }
    catch (error) { return sendApiError(c, 409, 'chat_not_running', (error as Error).message); }
    return c.json({ ok: true });
  });
  return routes;
}
