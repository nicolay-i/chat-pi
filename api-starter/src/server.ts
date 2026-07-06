import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { DatabaseSync } from 'node:sqlite';
import {
  ApiErrorSchema,
  CapabilitiesSchema,
  CreateChatInputSchema,
  CreateProjectInputSchema,
  HealthResponseSchema,
  SendMessageInputSchema,
  TaskStatus,
  TaskStatusSchema,
  UpdateProjectInputSchema,
  ValidateRepoInputSchema,
} from '@pi-agents/contracts';
import { config } from './config';
import { createProjectService } from './services/projectService';
import { createChatService } from './services/chatService';
import { createTaskService } from './services/taskService';
import { GitWorktreeService } from './services/gitWorktreeService';
import { createEventStore, type EventStream } from './realtime/eventStore';
import { toSseResponse } from './realtime/sse';

function sendApiError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
) {
  const body = ApiErrorSchema.parse({ code, message, retryable: false });
  return c.json(body, status);
}

export function createApp(db: DatabaseSync): Hono {
  const app = new Hono();
  const worktree = new GitWorktreeService();
  const projectService = createProjectService(db);
  const taskService = createTaskService(db, { worktree });
  const chatService = createChatService(db, { tasks: taskService });
  const eventStore = createEventStore(db);

  app.get('/health', (c) =>
    c.json(
      HealthResponseSchema.parse({ ok: true, time: new Date().toISOString() }),
    ),
  );

  app.get('/api/capabilities', (c) =>
    c.json(
      CapabilitiesSchema.parse({
        apiVersion: '0.0.0',
        piAvailable: false,
        gitAvailable: true,
        supportsWorktrees: true,
        supportsSse: true,
        supportsWebSocket: false,
        supportsPackageInstall: true,
        supportsVscodeWeb: false,
        supportsIgnis: false,
      }),
    ),
  );

  app.get('/api/projects', async (c) => {
    const items = await projectService.list();
    return c.json(items);
  });

  app.post('/api/projects', async (c) => {
    let parsed;
    try {
      parsed = CreateProjectInputSchema.parse(await c.req.json());
    } catch (err) {
      return sendApiError(c, 400, 'invalid_input', (err as Error).message);
    }
    try {
      const project = await projectService.create(parsed);
      return c.json(project, 201);
    } catch (err) {
      return sendApiError(c, 500, 'create_failed', (err as Error).message);
    }
  });

  app.get('/api/projects/:id', async (c) => {
    const project = await projectService.get(c.req.param('id'));
    if (!project) return sendApiError(c, 404, 'not_found', 'project not found');
    return c.json(project);
  });

  app.patch('/api/projects/:id', async (c) => {
    let parsed;
    try {
      parsed = UpdateProjectInputSchema.parse(await c.req.json());
    } catch (err) {
      return sendApiError(c, 400, 'invalid_input', (err as Error).message);
    }
    const project = await projectService.update(c.req.param('id'), parsed);
    if (!project) return sendApiError(c, 404, 'not_found', 'project not found');
    return c.json(project);
  });

  app.delete('/api/projects/:id', async (c) => {
    await projectService.remove(c.req.param('id'));
    return c.body(null, 204);
  });

  app.post('/api/projects/:id/validate-repo', async (c) => {
    const id = c.req.param('id');
    const project = await projectService.get(id);
    if (!project) return sendApiError(c, 404, 'not_found', 'project not found');
    const body = await c.req.json().catch(() => ({} as unknown));
    const fallback = {
      repoPath: project.repoPath,
      defaultBranch: project.defaultBranch,
    };
    const input = {
      repoPath:
        typeof (body as { repoPath?: unknown }).repoPath === 'string'
          ? (body as { repoPath: string }).repoPath
          : fallback.repoPath,
      defaultBranch:
        typeof (body as { defaultBranch?: unknown }).defaultBranch === 'string'
          ? (body as { defaultBranch: string }).defaultBranch
          : fallback.defaultBranch,
    };
    let parsed;
    try {
      parsed = ValidateRepoInputSchema.parse(input);
    } catch (err) {
      return sendApiError(c, 400, 'invalid_input', (err as Error).message);
    }
    const result = await projectService.validateRepo(parsed);
    return c.json(result);
  });

  app.get('/api/projects/:id/chats', async (c) => {
    const items = await chatService.list(c.req.param('id'));
    return c.json(items);
  });

  app.post('/api/projects/:id/chats', async (c) => {
    let parsed;
    try {
      parsed = CreateChatInputSchema.parse(await c.req.json());
    } catch (err) {
      return sendApiError(c, 400, 'invalid_input', (err as Error).message);
    }
    try {
      const chat = await chatService.create(c.req.param('id'), parsed);
      return c.json(chat, 201);
    } catch (err) {
      return sendApiError(c, 500, 'create_failed', (err as Error).message);
    }
  });

  app.get('/api/projects/:id/tasks', async (c) => {
    const items = await taskService.listByProject(c.req.param('id'));
    return c.json(items);
  });

  app.get('/api/chats/:id', async (c) => {
    const chat = await chatService.get(c.req.param('id'));
    if (!chat) return sendApiError(c, 404, 'not_found', 'chat not found');
    return c.json(chat);
  });

  app.get('/api/tasks/:id', async (c) => {
    const task = await taskService.get(c.req.param('id'));
    if (!task) return sendApiError(c, 404, 'not_found', 'task not found');
    return c.json(task);
  });

  app.patch('/api/tasks/:id', async (c) => {
    const body = await c.req.json().catch(() => ({} as unknown));
    const rawStatus = (body as { status?: unknown }).status;
    let status: TaskStatus;
    try {
      status = TaskStatusSchema.parse(rawStatus);
    } catch (err) {
      return sendApiError(c, 400, 'invalid_input', (err as Error).message);
    }
    try {
      const task = await taskService.updateStatus(c.req.param('id'), status);
      return c.json(task);
    } catch (err) {
      return sendApiError(c, 400, 'invalid_transition', (err as Error).message);
    }
  });

  app.post('/api/chats/:chatId/messages', async (c) => {
    const chatId = c.req.param('chatId');
    const body = SendMessageInputSchema.parse(await c.req.json());
    const chat = await chatService.get(chatId);
    const projectId = chat?.projectId ?? chatId;
    await eventStore.append({
      stream: 'chat',
      streamId: chatId,
      projectId,
      chatId,
      type: 'message.created',
      payload: { role: 'user', text: body.text, behavior: body.behavior },
    });
    return c.json({ ok: true, chatId, accepted: body.behavior });
  });

  const sseHandler = (stream: EventStream) => (c: Context): Response => {
    const paramKey =
      stream === 'chat' ? 'chatId' : stream === 'task' ? 'taskId' : 'projectId';
    const streamId = c.req.param(paramKey);
    if (streamId === undefined) {
      return sendApiError(c, 400, 'invalid_input', `missing path param: ${paramKey}`);
    }
    const after = c.req.query('after');
    const replay = eventStore.stream(stream, streamId, after);
    return toSseResponse({
      replay,
      subscribe: (onChange) =>
        eventStore.subscribe(stream, streamId, after, onChange),
    });
  };

  app.get('/api/chats/:chatId/events', sseHandler('chat'));
  app.get('/api/tasks/:taskId/events', sseHandler('task'));
  app.get('/api/projects/:projectId/events', sseHandler('project'));

  if (config.nodeEnv !== 'production') {
    app.get('/__throws', () => {
      throw new Error('boom');
    });
  }

  app.onError((err, c) => {
    const body = ApiErrorSchema.parse({
      code: 'internal_error',
      message: err.message,
      retryable: false,
    });
    return c.json(body, 500);
  });

  return app;
}

export type AppType = ReturnType<typeof createApp>;
