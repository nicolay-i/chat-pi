import {
  clearBackendUrl,
  clearBackendCredential,
  clearBackendProjectsSnapshot,
  loadBackendCredential,
  loadBackendProjectsSnapshot,
  loadBackendUrl,
  saveBackendCredential,
  saveBackendProjectsSnapshot,
  saveBackendUrl,
} from '../backendStorage';

describe('backendStorage on web', () => {
  const values = new Map<string, string>();
  let originalStorage: PropertyDescriptor | undefined;

  beforeEach(() => {
    values.clear();
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('persists the backend URL across a store reload', async () => {
    await saveBackendUrl('https://chat.tailnet.ts.net');
    expect(await loadBackendUrl()).toBe('https://chat.tailnet.ts.net');

    await clearBackendUrl();
    expect(await loadBackendUrl()).toBeNull();
  });

  it('does not put bearer credentials in Web localStorage', async () => {
    await saveBackendCredential('server-1', 'secret-token');
    expect(await loadBackendCredential('server-1')).toBe('secret-token');
    expect(values.size).toBe(0);
    await clearBackendCredential('server-1');
    expect(await loadBackendCredential('server-1')).toBeNull();
  });

  it('persists project metadata snapshots per server without using them for credentials', async () => {
    const project = {
      id: 'project-1',
      serverId: 'server-1',
      name: 'Offline project',
      repoPath: '/projects/offline',
      defaultBranch: 'main',
      agentsDir: '.agents',
      ignisUrl: null,
      activeTaskCount: 2,
      updatedAt: '2026-08-11T00:00:00.000Z',
    };

    await saveBackendProjectsSnapshot('server-1', [project]);
    expect(await loadBackendProjectsSnapshot('server-1')).toEqual([project]);
    expect(await loadBackendProjectsSnapshot('server-2')).toEqual([]);
    expect(values.size).toBe(1);

    await clearBackendProjectsSnapshot('server-1');
    expect(await loadBackendProjectsSnapshot('server-1')).toEqual([]);
  });

  it('ignores malformed project snapshot entries', async () => {
    values.set('backend.projects.snapshot.v1:server-1', JSON.stringify([{ id: 'broken' }]));
    expect(await loadBackendProjectsSnapshot('server-1')).toEqual([]);
  });
});
