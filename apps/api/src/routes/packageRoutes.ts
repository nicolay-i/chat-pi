import { Hono } from 'hono';
import { PackageManifestSchema } from '@pi-agents/contracts';
import { z } from 'zod';
import { sendApiError } from '../app/apiError';
import type { ServiceContainer } from '../app/serviceContainer';

export const packageRouteOperationIds = ['packages.list', 'packages.resolve', 'packages.install', 'packages.trust', 'packages.remove'] as const;
const SourceSchema = z.object({ kind: z.enum(['npm', 'git', 'local']), ref: z.string().min(1) });
const InstallInputSchema = z.object({ source: SourceSchema, manifest: PackageManifestSchema });

export function createPackageRoutes({ packageService }: ServiceContainer): Hono {
  const routes = new Hono();
  const findPackage = async (projectId: string, idOrName: string) => (await packageService.list(projectId)).find((pkg) => pkg.id === idOrName || pkg.name === idOrName);
  const manifestFor = (pkg: Awaited<ReturnType<typeof findPackage>>) => pkg ? { ...pkg.manifest, trusted: pkg.trusted } : undefined;

  routes.get('/api/projects/:projectId/packages', async (c) => c.json((await packageService.list(c.req.param('projectId'))).map((pkg) => ({ ...pkg.manifest, trusted: pkg.trusted }))));
  routes.post('/api/projects/:projectId/packages/resolve', async (c) => {
    const input = SourceSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json({ installId: '', status: 'pending_trust', manifest: await packageService.resolve(input.data) }); }
    catch (error) { return sendApiError(c, 400, 'resolve_failed', (error as Error).message); }
  });
  routes.post('/api/projects/:projectId/packages/install', async (c) => {
    const input = InstallInputSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) return sendApiError(c, 400, 'invalid_input', input.error.message);
    try { return c.json(await packageService.install(c.req.param('projectId'), input.data), 201); }
    catch (error) { return sendApiError(c, 400, 'install_failed', (error as Error).message); }
  });
  routes.post('/api/projects/:projectId/packages/:installId/trust', async (c) => {
    const pkg = await findPackage(c.req.param('projectId'), c.req.param('installId'));
    if (!pkg) return sendApiError(c, 404, 'not_found', 'package not found');
    await packageService.trust(pkg.id);
    const trusted = await findPackage(c.req.param('projectId'), pkg.id);
    return c.json({ installId: pkg.id, status: 'installed', manifest: manifestFor(trusted) });
  });
  routes.delete('/api/projects/:projectId/packages/:installId', async (c) => {
    const pkg = await findPackage(c.req.param('projectId'), c.req.param('installId'));
    if (!pkg) return sendApiError(c, 404, 'not_found', 'package not found');
    await packageService.remove(pkg.id);
    return c.json({ ok: true });
  });
  return routes;
}
