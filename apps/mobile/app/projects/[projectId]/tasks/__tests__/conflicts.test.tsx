
import { renderWithStore as render } from '@/test/renderWithStore';

jest.mock('@/navigation', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({ taskId: 'task-1' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import ConflictsScreen from '../[taskId]/conflicts';

const originalFetch = globalThis.fetch;

function configureBackend(url: string): void {
  const mod = require('@/test/rootStoreHarness') as typeof import('@/test/rootStoreHarness');
  mod.backendActions.setBaseUrl(url);
}

describe('ConflictsScreen', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('does not expose fake file-resolution or VSCode actions without backend support', async () => {
    configureBackend('https://backend.example');
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        id: 'task-1', projectId: 'project-1', title: 'Merge', mode: 'implementation', status: 'merge_conflict',
        branchName: 'agents/task-1', worktreePath: '/repo/task-1', changedFiles: 1, updatedAt: '2026-07-11T10:00:00.000Z',
      }),
    })) as typeof fetch;

    const { findByTestId, queryByTestId } = await render(<ConflictsScreen />);

    expect(await findByTestId('conflict.unsupported')).toBeTruthy();
    expect(queryByTestId('conflict.action.vscode')).toBeNull();
    expect(queryByTestId('conflict.action.ours')).toBeNull();
    expect(queryByTestId('conflict.action.abort')).toBeTruthy();
  });
});
