import { Hono } from 'hono';
import { ProviderSchema } from '@pi-agents/contracts';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const providerRouteOperationIds = ['providers.list', 'providers.create', 'providers.test'] as const;

export function createProviderRoutes({ providerService }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.get('/api/projects/:projectId/providers', async (c) => c.json(await providerService.list(c.req.param('projectId'))));
  routes.post('/api/projects/:projectId/providers', async (c) => {
    const input = ProviderSchema.omit({ id: true }).safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try {
      return c.json(await providerService.create(c.req.param('projectId'), {
        name: input.data.type,
        type: input.data.type,
        baseUrl: input.data.baseUrl,
        // Provider secrets are not accepted by this endpoint. This marker only
        // records that X04 must resolve a secret before the provider can run.
        secretRef: input.data.hasSecret ? 'pending-secret-configuration' : undefined,
        models: input.data.models,
      }), 201);
    } catch (error) { return sendApiError(c, 400, 'create_failed', (error as Error).message); }
  });
  routes.post('/api/projects/:projectId/providers/:providerId/test', async (c) => {
    try { return c.json(await providerService.test(c.req.param('providerId'))); }
    catch (error) { return sendApiError(c, 404, 'not_found', (error as Error).message); }
  });
  return routes;
}
