import { ProjectsStore } from '../projectsStore';
import type { BackendStore } from '../rootStore';

const project = {
  id: 'project-1',
  name: 'Cached project',
  repoPath: '/projects/cached',
  defaultBranch: 'main',
  agentsDir: '.agents',
  ignisUrl: null,
  activeTaskCount: 0,
  updatedAt: '2026-08-11T00:00:00.000Z',
};

function backend(overrides: Partial<BackendStore> = {}): BackendStore {
  return {
    connections: [{
      serverId: 'node-1',
      name: 'Node 1',
      baseUrl: 'https://node-1.example',
      capabilities: null,
      authRequired: false,
      credentialSet: false,
      status: 'connected',
      latencyMs: 10,
      error: null,
      lastSuccessfulAt: null,
    }],
    baseUrl: 'https://node-1.example',
    serverId: 'node-1',
    markHealthy: jest.fn(),
    markUnavailable: jest.fn(),
    ...overrides,
  } as unknown as BackendStore;
}

describe('ProjectsStore offline projections', () => {
  it('restores a per-node snapshot when the API is unavailable', async () => {
    const apiClientFactory = jest.fn(() => ({
      getProjects: jest.fn().mockRejectedValue(new Error('network unavailable')),
    }));
    const loadProjectsSnapshot = jest.fn().mockResolvedValue([project]);
    const store = new ProjectsStore(backend(), {
      apiClientFactory: apiClientFactory as never,
      snapshotStorage: { loadProjectsSnapshot },
    });

    await store.load();

    expect(loadProjectsSnapshot).toHaveBeenCalledWith('node-1');
    expect(store.status).toBe('loaded');
    expect(store.error).toContain('1 server connection unavailable');
    expect(store.data).toEqual([{ ...project, serverId: 'node-1' }]);
  });

  it('replaces only the refreshed node and saves its new snapshot', async () => {
    const fresh = { ...project, name: 'Fresh project' };
    const saveProjectsSnapshot = jest.fn().mockResolvedValue(undefined);
    const store = new ProjectsStore(backend(), {
      apiClientFactory: (() => ({ getProjects: jest.fn().mockResolvedValue([fresh]) })) as never,
      snapshotStorage: { saveProjectsSnapshot },
    });

    await store.load();

    expect(store.data).toEqual([{ ...fresh, serverId: 'node-1' }]);
    expect(saveProjectsSnapshot).toHaveBeenCalledWith('node-1', [fresh]);
  });

  it('keys a response by its source node even when the API omits serverId', async () => {
    const second = {
      serverId: 'node-2',
      name: 'Node 2',
      baseUrl: 'https://node-2.example',
      capabilities: null,
      authRequired: false,
      credentialSet: false,
      status: 'connected' as const,
      latencyMs: 12,
      error: null,
      lastSuccessfulAt: null,
    };
    const source = backend({ connections: [backend().connections[0]!, second] });
    const store = new ProjectsStore(source, {
      apiClientFactory: ((baseUrl: string) => ({
        getProjects: jest.fn().mockResolvedValue([{ ...project, name: baseUrl }]),
      })) as never,
    });

    await store.load();

    expect(store.data).toEqual([
      { ...project, name: 'https://node-1.example', serverId: 'node-1' },
      { ...project, name: 'https://node-2.example', serverId: 'node-2' },
    ]);
    expect(store.getById('project-1', 'node-2')?.name).toBe('https://node-2.example');
  });
});
