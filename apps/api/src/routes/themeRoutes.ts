import { Hono } from 'hono';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const themeRouteOperationIds = ['theme.save'] as const;
export function createThemeRoutes({ themeStore }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.post('/api/projects/:projectId/theme', async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendApiError(c, 400, 'invalid_input', 'theme overrides must be an object');
    try { themeStore.save(c.req.param('projectId'), body); return c.json({ ok: true }); }
    catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); }
  });
  return routes;
}
