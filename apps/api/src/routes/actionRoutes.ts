import { Hono } from 'hono';
import { z } from 'zod';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const actionRouteOperationIds = ['actions.list', 'actions.run', 'actions.run.get'] as const;
const RunActionInputSchema = z.object({ input: z.record(z.string(), z.unknown()).optional() });

export function createActionRoutes({ actionEngine }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.get('/api/projects/:projectId/actions', async (c) => {
    const context = c.req.query('context');
    return c.json(await actionEngine.listActions(c.req.param('projectId'), context ? { taskStatus: context } : undefined));
  });
  routes.post('/api/actions/:actionId/run', async (c) => {
    const input = RunActionInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(await actionEngine.runAction(c.req.param('actionId'), input.data.input)); }
    catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); }
  });
  routes.get('/api/action-runs/:actionRunId', async (c) => {
    const run = await actionEngine.getActionRun(c.req.param('actionRunId'));
    return run ? c.json(run) : sendApiError(c, 404, 'not_found', 'action run not found');
  });
  return routes;
}
