import { Hono } from 'hono';
import { PromptTemplateSchema } from '@pi-agents/contracts';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const promptRouteOperationIds = ['prompts.list', 'prompts.save'] as const;
export function createPromptRoutes({ promptStore }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.get('/api/projects/:projectId/prompts', (c) => { try { return c.json(promptStore.list(c.req.param('projectId'))); } catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); } });
  routes.put('/api/projects/:projectId/prompts/:templateId', async (c) => {
    const input = PromptTemplateSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success || input.data.id !== c.req.param('templateId')) return sendApiError(c, 400, 'invalid_input', 'valid template matching templateId is required');
    try { return c.json(promptStore.save(c.req.param('projectId'), input.data)); } catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); }
  });
  return routes;
}
