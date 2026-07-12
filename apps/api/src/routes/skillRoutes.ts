import { Hono } from 'hono';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const skillRouteOperationIds = ['skills.list', 'skills.get', 'skills.save', 'skills.test'] as const;

export function createSkillRoutes({ skillRunner }: ServiceContainer): Hono {
  const routes = new Hono();
  const find = (projectId: string, skillId: string) => skillRunner.getSkill(projectId, skillId);
  routes.get('/api/projects/:projectId/skills', async (c) => c.json(await skillRunner.listSkills(c.req.param('projectId'))));
  routes.get('/api/projects/:projectId/skills/:skillId', async (c) => {
    const skill = await find(c.req.param('projectId'), c.req.param('skillId'));
    return skill ? c.json(skill) : sendApiError(c, 404, 'not_found', 'skill not found');
  });
  routes.put('/api/projects/:projectId/skills/:skillId', async (c) => {
    const body = await c.req.json().catch(() => null) as Partial<import('@pi-agents/contracts').Skill> | null;
    if (!body || (body.name !== undefined && typeof body.name !== 'string') || (body.enabled !== undefined && typeof body.enabled !== 'boolean')) return sendApiError(c, 400, 'invalid_input', 'invalid skill patch');
    try { return c.json(await skillRunner.saveSkill(c.req.param('projectId'), c.req.param('skillId'), body)); }
    catch (error) { return sendApiError(c, 400, 'save_failed', (error as Error).message); }
  });
  routes.post('/api/projects/:projectId/skills/:skillId/test', async (c) => {
    const skill = await find(c.req.param('projectId'), c.req.param('skillId'));
    if (!skill) return sendApiError(c, 404, 'not_found', 'skill not found');
    const result = await skillRunner.runSkill(skill.id);
    return c.json({ ok: result.ok });
  });
  return routes;
}
