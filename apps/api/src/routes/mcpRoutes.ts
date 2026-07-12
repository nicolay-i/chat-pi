import { Hono } from 'hono';
import { McpServerSchema } from '@pi-agents/contracts';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const mcpRouteOperationIds = ['mcp.list', 'mcp.save', 'mcp.test'] as const;
export function createMcpRoutes({ mcpStore }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.get('/api/projects/:projectId/mcp', (c) => { try { return c.json(mcpStore.list(c.req.param('projectId'))); } catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); } });
  routes.put('/api/projects/:projectId/mcp', async (c) => {
    const input = McpServerSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(mcpStore.save(c.req.param('projectId'), input.data)); } catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); }
  });
  routes.post('/api/projects/:projectId/mcp/:serverId/test', (c) => {
    try { return c.json({ ok: mcpStore.has(c.req.param('projectId'), c.req.param('serverId')) }); } catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); }
  });
  return routes;
}
