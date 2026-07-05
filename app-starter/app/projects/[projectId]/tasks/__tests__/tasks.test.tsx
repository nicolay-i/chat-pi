import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import TasksScreen from '../index';

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

function makeTask(overrides: Partial<Record<string, unknown>> & { id: string }) {
  return {
    id: overrides.id,
    projectId: 'project-demo',
    title: overrides.title ?? `Task ${overrides.id}`,
    mode: 'implementation',
    status: overrides.status ?? 'running',
    branchName: overrides.branchName ?? `branch-${overrides.id}`,
    worktreePath: `/wt/${overrides.id}`,
    changedFiles: overrides.changedFiles ?? 3,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function configureBackend(url: string): void {
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

describe('TasksScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(
        () => new Promise<Response>(() => {}),
      ),
    );

    const { getByTestId } = await render(<TasksScreen />);
    expect(getByTestId('tasks.loading')).toBeTruthy();
  });

  it('renders loaded list with running section and task card', async () => {
    configureBackend('https://backend.example');
    const running = makeTask({ id: 'task-running', title: 'Parallel refactor', status: 'running' });
    const merged = makeTask({ id: 'task-merged', title: 'Done feature', status: 'merged' });
    setFetch(jest.fn(async () => jsonRes([running, merged])));

    const { findByTestId, getByText } = await render(<TasksScreen />);
    expect(await findByTestId('tasks.list')).toBeTruthy();
    expect(await findByTestId('tasks.section.running')).toBeTruthy();
    expect(await findByTestId('tasks.section.merged')).toBeTruthy();
    expect(getByText('Parallel refactor')).toBeTruthy();
    expect(getByText('running')).toBeTruthy();
  });

  it('shows parallel running tasks as independent cards', async () => {
    configureBackend('https://backend.example');
    const a = makeTask({ id: 'r-a', status: 'running' });
    const b = makeTask({ id: 'r-b', status: 'running' });
    setFetch(jest.fn(async () => jsonRes([a, b])));

    const { findByTestId } = await render(<TasksScreen />);
    expect(await findByTestId('tasks.item.r-a')).toBeTruthy();
    expect(await findByTestId('tasks.item.r-b')).toBeTruthy();
  });

  it('renders empty state when no tasks', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));

    const { findByTestId } = await render(<TasksScreen />);
    expect(await findByTestId('tasks.empty')).toBeTruthy();
  });

  it('renders error state with retry when fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));

    const { findByTestId, findByText } = await render(<TasksScreen />);
    expect(await findByTestId('tasks.error')).toBeTruthy();
    expect(await findByText(/network down/)).toBeTruthy();
  });
});
