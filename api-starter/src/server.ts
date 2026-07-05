import { Hono } from 'hono';
import {
  ProjectSchema,
  SendMessageInputSchema,
  CapabilitiesSchema,
  HealthResponseSchema,
  ApiErrorSchema,
} from '@pi-agents/contracts';
import { config } from './config';

export const app = new Hono();

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

app.get('/api/projects', (c) =>
  c.json([
    ProjectSchema.parse({
      id: 'project-demo',
      name: 'pi.dev workspace',
      repoPath: '/var/lib/agents/projects/pi-dev/repo',
      defaultBranch: 'main',
      agentsDir: '.agents',
      activeTaskCount: 3,
      updatedAt: new Date().toISOString(),
    }),
  ])
);

app.post('/api/chats/:chatId/messages', async (c) => {
  const body = SendMessageInputSchema.parse(await c.req.json());
  return c.json({ ok: true, chatId: c.req.param('chatId'), accepted: body.behavior });
});

app.get('/api/chats/:chatId/events', (c) => {
  const stream = new ReadableStream({
    start(controller) {
      const event = {
        id: 'evt-demo-1',
        stream: 'chat',
        streamId: c.req.param('chatId'),
        type: 'message.completed',
        payload: { role: 'assistant', text: 'demo event' },
        createdAt: new Date().toISOString(),
      };
      controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
});

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

export type AppType = typeof app;
