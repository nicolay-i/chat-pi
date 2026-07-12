import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import type { RouterClient } from '@orpc/server';
import { describe, expect, it } from 'vitest';
import { createDb } from '../db';
import { createApp } from '../server';
import { providerRpcRouter } from './providerRouter';

describe('providerRpcRouter', () => {
  it('uses the typed RPC client through the mounted Hono transport', async () => {
    const app = createApp(createDb(':memory:'));
    const project = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'oRPC smoke', repoPath: 'C:/repo', defaultBranch: 'main' }),
    });
    const { id: projectId } = await project.json() as { id: string };
    const client: RouterClient<typeof providerRpcRouter> = createORPCClient(new RPCLink({
      url: 'http://localhost/rpc',
      fetch: async (request) => app.fetch(request),
    }));

    const created = await client.providers.create({
      projectId,
      provider: {
        type: 'custom',
        hasSecret: true,
        models: [{ id: 'local-model', label: 'Local model' }],
      },
    });
    expect(created.hasSecret).toBe(true);

    await expect(client.providers.list({ projectId })).resolves.toEqual([created]);
    await expect(client.providers.test({ providerId: created.id })).resolves.toEqual({
      ok: true,
      modelsFound: ['local-model'],
    });
  });
});
