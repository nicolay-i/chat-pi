import { Hono } from 'hono';
import { CreateProjectInputSchema, ProjectRemoteSyncInputSchema, UpdateProjectInputSchema, ValidateRepoInputSchema } from '@pi-agents/contracts';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const projectRouteOperationIds = [
  'projects.list', 'projects.create', 'projects.get', 'projects.update', 'projects.delete', 'projects.validate', 'projects.remoteSync', 'projects.ignis',
] as const;

export function createProjectRoutes({ projectService, projectRemoteSyncService, ignisService }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.get('/api/projects', async (c) => c.json(await projectService.list()));
  routes.post('/api/projects', async (c) => {
    let input;
    try { input = CreateProjectInputSchema.parse(await c.req.json()); }
    catch (error) { return sendApiError(c, 400, 'invalid_input', (error as Error).message); }
    try { return c.json(await projectService.create(input), 201); }
    catch (error) {
      const message = (error as Error).message;
      return sendApiError(c, message.startsWith('repoPath must be') ? 400 : 500, 'create_failed', message);
    }
  });
  routes.get('/api/projects/:id', async (c) => {
    const project = await projectService.get(c.req.param('id'));
    return project ? c.json(project) : sendApiError(c, 404, 'not_found', 'project not found');
  });
  routes.patch('/api/projects/:id', async (c) => {
    let input;
    try { input = UpdateProjectInputSchema.parse(await c.req.json()); }
    catch (error) { return sendApiError(c, 400, 'invalid_input', (error as Error).message); }
    try {
      const project = await projectService.update(c.req.param('id'), input);
      return project ? c.json(project) : sendApiError(c, 404, 'not_found', 'project not found');
    } catch (error) {
      const message = (error as Error).message;
      return sendApiError(c, message.startsWith('repoPath must be') ? 400 : 500, 'update_failed', message);
    }
  });
  routes.delete('/api/projects/:id', async (c) => {
    await projectService.remove(c.req.param('id'));
    return c.body(null, 204);
  });
  routes.post('/api/projects/:id/validate-repo', async (c) => {
    const project = await projectService.get(c.req.param('id'));
    if (!project) return sendApiError(c, 404, 'not_found', 'project not found');
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    try {
      const input = ValidateRepoInputSchema.parse({
        repoPath: typeof body.repoPath === 'string' ? body.repoPath : project.repoPath,
        defaultBranch: typeof body.defaultBranch === 'string' ? body.defaultBranch : project.defaultBranch,
      });
      return c.json(await projectService.validateRepo(input));
    } catch (error) {
      return sendApiError(c, 400, 'invalid_input', (error as Error).message);
    }
  });
  routes.post('/api/projects/:id/remote-sync', async (c) => {
    const input = ProjectRemoteSyncInputSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(await projectRemoteSyncService.sync(c.req.param('id'), input.data.mode)); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return sendApiError(c, message.startsWith('project not found') ? 404 : 409, 'remote_sync_failed', message);
    }
  });
  routes.get('/api/projects/:id/ignis', (c) => {
    const access = ignisService.getAccess(c.req.param('id'));
    return access ? c.json(access) : sendApiError(c, 404, 'not_found', 'project not found');
  });
  return routes;
}
