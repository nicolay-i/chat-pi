import { act } from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';

jest.mock('@/navigation', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ taskId: 'task-1' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import DiffScreen from '../[taskId]/diff';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;

const setFetch = (fn: FetchImpl): void => {
  (globalThis as { fetch: FetchImpl }).fetch = fn;
};

const restoreFetch = (): void => {
  (globalThis as { fetch: FetchImpl }).fetch = originalFetch;
};

const jsonRes = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as unknown as Response;

function configureBackend(url: string): void {
  const mod = require('@/test/rootStoreHarness') as typeof import('@/test/rootStoreHarness');
  mod.backendActions.setBaseUrl(url);
}

const ENTRIES = [
  { path: 'src/a.ts', status: 'added', additions: 3, deletions: 0 },
  { path: 'README.md', status: 'modified', additions: 1, deletions: 1 },
];

const FILE_A = {
  path: 'src/a.ts',
  hunks: [{ header: '@@ -1,1 +1,3 @@', lines: [' ctx', '+added line 1', '+added line 2'] }],
};

const FILE_MD = {
  path: 'README.md',
  hunks: [{ header: '@@ -1,1 +1,1 @@', lines: ['-# Old', '+# New'] }],
};

describe('DiffScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders empty state when no diff entries', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));
    const { findByTestId } = await render(<DiffScreen />);
    expect(await findByTestId('diff.empty')).toBeTruthy();
  });

  it('loads entries, auto-selects first file and renders unified diff', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/diff/files/')) return jsonRes(FILE_A);
      return jsonRes(ENTRIES);
    });
    setFetch(fetchMock);

    const { findByTestId, getByTestId } = await render(<DiffScreen />);
    expect(await findByTestId('diff.unified')).toBeTruthy();
    expect(getByTestId('chat.diffPreview')).toBeTruthy();
    const fileCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/diff/files/'));
    expect(fileCall?.[0]).toBe('https://backend.example/api/tasks/task-1/diff/files/src%2Fa.ts');
  });

  it('shows Markdown rendered diff placeholder for .md files', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/diff/files/')) return jsonRes(FILE_MD);
        return jsonRes([{ path: 'README.md', status: 'modified', additions: 1, deletions: 1 }]);
      }),
    );

    const { findByTestId } = await render(<DiffScreen />);
    expect(await findByTestId('diff.markdownPlaceholder')).toBeTruthy();
  });

  it('shows large file warning when hunks exceed 500 lines', async () => {
    configureBackend('https://backend.example');
    const bigLines = new Array(501).fill('+line');
    setFetch(
      jest.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/diff/files/')) {
          return jsonRes({ path: 'big.ts', hunks: [{ header: '@@ -1,1 +1,501 @@', lines: bigLines }] });
        }
        return jsonRes([{ path: 'big.ts', status: 'added', additions: 501, deletions: 0 }]);
      }),
    );

    const { findByTestId } = await render(<DiffScreen />);
    expect(await findByTestId('diff.largeWarning')).toBeTruthy();
  });

  it('opens confirmation dialog and posts revert on confirm', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/diff/files/')) return jsonRes(FILE_A);
      if (url.includes('/revert-file')) {
        return jsonRes({
          id: 'task-1',
          projectId: 'p1',
          title: 't',
          mode: 'implementation',
          status: 'idle',
          branchName: 'b',
          worktreePath: '/wt',
          changedFiles: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
      }
      return jsonRes(ENTRIES);
    });
    setFetch(fetchMock);

    const { findByTestId, getByTestId } = await render(<DiffScreen />);
    await findByTestId('diff.unified');

    await act(async () => {
      fireEvent.press(getByTestId('diff.revert'));
    });
    expect(getByTestId('diff.confirmDialog')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('diff.confirm.confirm'));
    });

    const revertCall = fetchMock.mock.calls.find((call) => {
      const url = String(call[0]);
      return url.includes('/revert-file');
    });
    expect(revertCall).toBeTruthy();
    expect(String(revertCall?.[0])).toBe('https://backend.example/api/tasks/task-1/revert-file');
    expect(revertCall?.[1]?.method).toBe('POST');
    expect(revertCall?.[1]?.body).toBe(JSON.stringify({ path: 'src/a.ts', confirm: true }));
  });

  it('renders error state when entries fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));
    const { findByTestId, findByText } = await render(<DiffScreen />);
    expect(await findByTestId('diff.error')).toBeTruthy();
    await findByText(/network down/);
  });
});
