import { Hono } from 'hono';
import { FileContentSchema } from '@pi-agents/contracts';
import { z } from 'zod';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';
import { ProjectFileError } from '../services/projectFilesService';

export const fileRouteOperationIds = [
  'files.list', 'files.content.get', 'files.content.put', 'files.search',
] as const;

const SearchInputSchema = z.object({ query: z.string().min(1).max(512) });

function sendFileError(c: Parameters<typeof sendApiError>[0], error: unknown) {
  if (error instanceof ProjectFileError) {
    const status = error.code === 'not_found' ? 404 : 400;
    return sendApiError(c, status, error.code, error.message);
  }
  return sendApiError(c, 500, 'file_operation_failed', error instanceof Error ? error.message : String(error));
}

export function createFileRoutes({ projectFiles }: ServiceContainer): Hono {
  const routes = new Hono();
  routes.get('/api/projects/:projectId/files', (c) => {
    try { return c.json(projectFiles.list(c.req.param('projectId'))); }
    catch (error) { return sendFileError(c, error); }
  });
  routes.get('/api/projects/:projectId/files/content', (c) => {
    const path = c.req.query('path');
    if (!path) return sendApiError(c, 400, 'invalid_path', 'path query parameter is required');
    try { return c.json(projectFiles.read(c.req.param('projectId'), path)); }
    catch (error) { return sendFileError(c, error); }
  });
  routes.put('/api/projects/:projectId/files/content', async (c) => {
    const input = FileContentSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(projectFiles.write(c.req.param('projectId'), input.data)); }
    catch (error) { return sendFileError(c, error); }
  });
  routes.post('/api/projects/:projectId/files/search', async (c) => {
    const input = SearchInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(projectFiles.search(c.req.param('projectId'), input.data.query)); }
    catch (error) { return sendFileError(c, error); }
  });
  return routes;
}
