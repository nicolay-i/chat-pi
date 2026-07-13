import { Hono } from 'hono';
import { CapabilitiesSchema, HealthResponseSchema } from '@pi-agents/contracts';
import { config } from '../config';

export const healthRouteOperationIds = ['health.get', 'capabilities.get'] as const;

export function createHealthRoutes(): Hono {
  const routes = new Hono();
  routes.get('/health', (c) => c.json(HealthResponseSchema.parse({ ok: true, time: new Date().toISOString() })));
  routes.get('/api/capabilities', (c) => c.json(CapabilitiesSchema.parse({
    apiVersion: '0.0.0', piAvailable: config.agentRuntime === 'pi', gitAvailable: true,
    supportsWorktrees: true, supportsSse: true, supportsWebSocket: false,
    supportsVscodeWeb: false, supportsIgnis: true,
  })));
  return routes;
}
