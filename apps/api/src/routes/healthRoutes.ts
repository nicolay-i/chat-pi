import { Hono } from 'hono';
import { CapabilitiesSchema, HealthResponseSchema } from '@pi-agents/contracts';
import { config } from '../config';

export const healthRouteOperationIds = ['health.get', 'capabilities.get', 'auth.check'] as const;

export function createHealthRoutes(
  serverId: string = crypto.randomUUID(),
  options: { authRequired?: boolean } = {},
): Hono {
  const routes = new Hono();
  routes.get('/health', (c) => c.json(HealthResponseSchema.parse({ ok: true, time: new Date().toISOString() })));
  routes.get('/api/capabilities', (c) => c.json(CapabilitiesSchema.parse({
    serverId, authRequired: options.authRequired ?? false,
    apiVersion: '0.0.0', piAvailable: config.agentRuntime === 'pi', gitAvailable: true,
    supportsWorktrees: true, supportsSse: true, supportsWebSocket: false,
    supportsVscodeWeb: false, supportsIgnis: true,
  })));
  routes.get('/api/auth/check', (c) => c.json({ ok: true }));
  return routes;
}
