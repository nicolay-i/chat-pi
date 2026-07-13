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

import CheckpointsScreen from '../[taskId]/checkpoints';

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

const CHECKPOINTS = [
  {
    id: 'cp-1',
    taskId: 'task-1',
    message: 'Initial commit',
    sha: 'a1b2c3d4e5f6789',
    changedFiles: 2,
    createdAt: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'cp-2',
    taskId: 'task-1',
    message: 'Refactored module',
    sha: '0123456789abcdef',
    changedFiles: 5,
    createdAt: '2026-01-02T12:30:00.000Z',
  },
];

function taskWith(id: string) {
  return {
    id,
    projectId: 'p1',
    title: 't',
    mode: 'implementation',
    status: 'idle',
    branchName: 'b',
    worktreePath: '/wt',
    changedFiles: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('CheckpointsScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders loading state, then shows checkpoint items', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(CHECKPOINTS)));

    const { findByTestId, getByTestId } = await render(<CheckpointsScreen />);
    expect(await findByTestId('checkpoint.item.cp-1')).toBeTruthy();
    expect(getByTestId('checkpoint.item.cp-2')).toBeTruthy();
    expect(getByTestId('checkpoint.tree')).toBeTruthy();
  }, 15_000);

  it('renders empty state when no checkpoints', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));

    const { findByTestId, queryByTestId } = await render(<CheckpointsScreen />);
    expect(await findByTestId('checkpoint.empty')).toBeTruthy();
    expect(queryByTestId('checkpoint.tree')).toBeFalsy();
  });

  it('opens rollback confirmation with "new task" wording and posts rollback with checkpoint id', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/rollback')) return jsonRes(taskWith('task-rolled'));
      return jsonRes(CHECKPOINTS);
    });
    setFetch(fetchMock);

    const { findByTestId, getByTestId, findByText } = await render(<CheckpointsScreen />);
    await findByTestId('checkpoint.item.cp-1');

    await act(async () => {
      fireEvent.press(getByTestId('checkpoint.rollback.cp-1'));
    });
    expect(getByTestId('checkpoint.confirmDialog')).toBeTruthy();
    await findByText(/Откат создаст новую задачу/);

    await act(async () => {
      fireEvent.press(getByTestId('checkpoint.confirm.confirm'));
    });

    const rollbackCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/rollback'));
    expect(rollbackCall).toBeTruthy();
    expect(String(rollbackCall?.[0])).toBe(
      'https://backend.example/api/tasks/task-1/checkpoints/cp-1/rollback',
    );
    expect(rollbackCall?.[1]?.method).toBe('POST');
  });

  it('opens fork confirmation and posts fork with checkpoint id', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/fork')) return jsonRes(taskWith('task-forked'));
      return jsonRes(CHECKPOINTS);
    });
    setFetch(fetchMock);

    const { findByTestId, getByTestId, findByText } = await render(<CheckpointsScreen />);
    await findByTestId('checkpoint.item.cp-2');

    await act(async () => {
      fireEvent.press(getByTestId('checkpoint.fork.cp-2'));
    });
    expect(getByTestId('checkpoint.confirmDialog')).toBeTruthy();
    await findByText(/Fork from this checkpoint/);

    await act(async () => {
      fireEvent.press(getByTestId('checkpoint.confirm.confirm'));
    });

    const forkCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/fork'));
    expect(forkCall).toBeTruthy();
    expect(String(forkCall?.[0])).toBe(
      'https://backend.example/api/tasks/task-1/checkpoints/cp-2/fork',
    );
    expect(forkCall?.[1]?.method).toBe('POST');
  });

  it('opens create dialog, types a message, and posts new checkpoint with payload', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/checkpoints') && init?.method === 'POST') {
        return jsonRes(CHECKPOINTS[0]);
      }
      return jsonRes(CHECKPOINTS);
    });
    setFetch(fetchMock);

    const { findByTestId, getByTestId } = await render(<CheckpointsScreen />);
    await findByTestId('checkpoint.item.cp-1');

    await act(async () => {
      fireEvent.press(getByTestId('checkpoint.create'));
    });
    expect(getByTestId('checkpoint.createDialog')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(getByTestId('checkpoint.createInput'), 'snap before refactor');
    });
    await act(async () => {
      fireEvent.press(getByTestId('checkpoint.create.confirm'));
    });

    const createCall = fetchMock.mock.calls.find((c) => {
      const url = String(c[0]);
      const init = c[1];
      return url.endsWith('/checkpoints') && init?.method === 'POST';
    });
    expect(createCall).toBeTruthy();
    expect(createCall?.[1]?.body).toBe(JSON.stringify({ message: 'snap before refactor' }));
  });

  it('renders error state when checkpoints fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));

    const { findByTestId, findByText } = await render(<CheckpointsScreen />);
    expect(await findByTestId('checkpoint.error')).toBeTruthy();
    await findByText(/network down/);
  });

  it('renders loading indicator before data resolves', async () => {
    configureBackend('https://backend.example');
    const deferred = new Promise<Response>(() => {
      // never resolves within the test window
    });
    setFetch(jest.fn(() => deferred));

    const { findByTestId } = await render(<CheckpointsScreen />);
    expect(await findByTestId('checkpoint.loading')).toBeTruthy();
  });
});
