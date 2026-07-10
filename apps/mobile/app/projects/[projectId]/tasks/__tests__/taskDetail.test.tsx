import { render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ taskId: 'task-1' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import TaskDetailScreen from '../[taskId]/index';

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

const TASK = {
  id: 'task-1',
  projectId: 'project-demo',
  title: 'Implement debounce',
  mode: 'implementation',
  status: 'running',
  branchName: 'feat/debounce',
  worktreePath: '/repo/.worktrees/task-1',
  changedFiles: 5,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function configureBackend(url: string): void {
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

describe('TaskDetailScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders tabs and header once loaded', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(TASK)));

    const { findByTestId, getByText } = await render(<TaskDetailScreen />);
    expect(await findByTestId('taskDetail.header')).toBeTruthy();
    expect(await findByTestId('taskDetail.tabs.overview')).toBeTruthy();
    expect(await findByTestId('taskDetail.tabs.diff')).toBeTruthy();
    expect(await findByTestId('taskDetail.tabs.merge')).toBeTruthy();
    expect(getByText('Implement debounce')).toBeTruthy();
    expect(getByText('feat/debounce')).toBeTruthy();
  });

  it('renders runtime panel and collapsed dangerous actions on overview', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(TASK)));

    const { findByTestId } = await render(<TaskDetailScreen />);
    expect(await findByTestId('taskDetail.runtimePanel')).toBeTruthy();
    expect(await findByTestId('taskDetail.dangerousActions')).toBeTruthy();
  });

  it('renders error state when fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('boom'))));

    const { findByTestId } = await render(<TaskDetailScreen />);
    expect(await findByTestId('taskDetail.error')).toBeTruthy();
  });
});
