import { Hono, type Context } from 'hono';
import type { EventStream } from '../realtime/eventStore';
import { toSseResponse } from '../realtime/sse';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const realtimeRouteOperationIds = ['events.chat', 'events.task', 'events.project'] as const;

export function createRealtimeRoutes({ eventStore }: ServiceContainer): Hono {
  const routes = new Hono();
  const handler = (stream: EventStream) => (c: Context): Response => {
    const paramKey = stream === 'chat' ? 'chatId' : stream === 'task' ? 'taskId' : 'projectId';
    const streamId = c.req.param(paramKey);
    if (streamId === undefined) return sendApiError(c, 400, 'invalid_input', `missing path param: ${paramKey}`);
    const rawAfterSequence = c.req.query('afterSequence');
    const afterSequence = rawAfterSequence === undefined ? undefined : Number(rawAfterSequence);
    if (afterSequence !== undefined && (!Number.isSafeInteger(afterSequence) || afterSequence < 0)) {
      return sendApiError(c, 400, 'invalid_input', 'afterSequence must be a non-negative integer');
    }
    return toSseResponse({
      replay: eventStore.stream(stream, streamId, afterSequence),
      subscribe: (onChange) => eventStore.subscribe(stream, streamId, afterSequence, onChange),
    });
  };
  routes.get('/api/chats/:chatId/events', handler('chat'));
  routes.get('/api/tasks/:taskId/events', handler('task'));
  routes.get('/api/projects/:projectId/events', handler('project'));
  return routes;
}
