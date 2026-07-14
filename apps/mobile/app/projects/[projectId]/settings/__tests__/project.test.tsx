import { act } from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';
import { backendActions } from '@/test/rootStoreHarness';
import EditProjectScreen from '../project';

jest.mock('@/navigation', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;
const jsonRes = (body: unknown): Response => ({ ok: true, json: async () => body }) as unknown as Response;

function configureBackend(url: string): void {
  backendActions.setBaseUrl(url);
}

describe('EditProjectScreen remote sync', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('inspects without mutation and requires confirmation before apply', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/remote-sync') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { mode: 'inspect' | 'apply' };
        return jsonRes({
          projectId: 'project-demo',
          status: body.mode === 'inspect' ? 'fast_forward_available' : 'fast_forward_applied',
          localSha: '1111111111111111111111111111111111111111',
          remoteSha: '2222222222222222222222222222222222222222',
          targetRef: 'origin/main',
          staleTaskIds: body.mode === 'apply' ? ['task-stale'] : [],
        });
      }
      return jsonRes({
        id: 'project-demo',
        name: 'Demo project',
        repoPath: '/srv/demo',
        defaultBranch: 'main',
        agentsDir: '.agents',
        ignisUrl: null,
        activeTaskCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    });
    (globalThis as { fetch: FetchImpl }).fetch = fetchMock;

    const screen = await render(<EditProjectScreen />);
    await screen.findByTestId('project.remoteSync');
    await act(async () => {
      fireEvent.press(screen.getByTestId('project.remoteSync.inspect'));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(await screen.findByText('fast forward available')).toBeTruthy();

    fireEvent.press(screen.getByTestId('project.remoteSync.apply'));
    expect(await screen.findByTestId('project.remoteSync.confirmDialog')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('project.remoteSync.confirm'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText('fast forward applied')).toBeTruthy();
    const modes = fetchMock.mock.calls
      .filter(([input]) => String(input).endsWith('/remote-sync'))
      .map(([, init]) => JSON.parse(String(init?.body)).mode);
    expect(modes).toEqual(['inspect', 'apply']);
  });
});
