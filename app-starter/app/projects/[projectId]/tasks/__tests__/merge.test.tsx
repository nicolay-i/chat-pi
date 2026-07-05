import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({ taskId: 'task-1' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import MergeScreen from '../[taskId]/merge';

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
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

function taskWith(status: string) {
  return {
    id: 'task-1',
    projectId: 'p1',
    title: 'Implement debounce',
    mode: 'implementation',
    status,
    branchName: 'feat/debounce',
    worktreePath: '/wt',
    changedFiles: 3,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('MergeScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('shows loading state, then loads the task', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async () => jsonRes(taskWith('idle')));
    setFetch(fetchMock);

    const { findByTestId } = await render(<MergeScreen />);
    expect(await findByTestId('merge.screen')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith('https://backend.example/api/tasks/task-1');
  });

  it('disables the submit button while the task is running', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(taskWith('running'))));

    const { findByTestId } = await render(<MergeScreen />);
    const submit = await findByTestId('merge.submit');
    expect(submit.props.accessibilityState?.disabled).toBe(true);
  });

  it('enables the submit button when the task is idle and opens confirm dialog', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(taskWith('idle'))));

    const { findByTestId, getByTestId } = await render(<MergeScreen />);
    const submit = await findByTestId('merge.submit');
    expect(submit.props.accessibilityState?.disabled).toBeFalsy();

    await act(async () => {
      fireEvent.press(submit);
    });
    expect(getByTestId('merge.confirmDialog')).toBeTruthy();
  });

  it('posts merge with strategy and commitMessage on confirm', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/merge')) return jsonRes(taskWith('merged'));
      return jsonRes(taskWith('needs_review'));
    });
    setFetch(fetchMock);

    const { findByTestId, getByTestId } = await render(<MergeScreen />);
    await findByTestId('merge.submit');

    await act(async () => {
      fireEvent.press(getByTestId('merge.strategy.rebase'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('merge.submit'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('merge.confirm'));
    });

    const mergeCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/merge'));
    expect(mergeCall).toBeTruthy();
    expect(String(mergeCall?.[0])).toBe('https://backend.example/api/tasks/task-1/merge');
    expect(mergeCall?.[1]?.method).toBe('POST');
    const body = JSON.parse(String(mergeCall?.[1]?.body)) as { strategy: string; commitMessage: string };
    expect(body.strategy).toBe('rebase');
    expect(body.commitMessage).toContain('Implement debounce');
  });

  it('shows the conflict link when status is merge_conflict', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(taskWith('merge_conflict'))));

    const { findByTestId, queryByTestId } = await render(<MergeScreen />);
    expect(await findByTestId('merge.conflictLink')).toBeTruthy();
    expect(queryByTestId('merge.submit')?.props.accessibilityState?.disabled).toBe(true);
  });

  it('renders error state when fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('boom'))));

    const { findByTestId } = await render(<MergeScreen />);
    expect(await findByTestId('merge.error')).toBeTruthy();
  });
});
