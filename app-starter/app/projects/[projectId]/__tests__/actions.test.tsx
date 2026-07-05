import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import ActionsScreen from '../actions';

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

const SAFE = {
  id: 'act-summary',
  label: 'Summarize',
  hasSideEffect: false,
};

const DANGER = {
  id: 'act-merge',
  label: 'Merge',
  hasSideEffect: true,
  confirmMessage: 'Слить изменения?',
};

function makeActionsFetch(): jest.Mock {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.includes('/api/projects/project-demo/actions') && method === 'GET') {
      return jsonRes([SAFE, DANGER]);
    }
    if (url.endsWith('/api/actions/act-summary/run') && method === 'POST') {
      return jsonRes({ id: 'run-1', actionId: 'act-summary', status: 'completed', createdAt: '2026-01-01T00:00:00.000Z' });
    }
    if (url.endsWith('/api/actions/act-merge/run') && method === 'POST') {
      return jsonRes({ id: 'run-2', actionId: 'act-merge', status: 'completed', createdAt: '2026-01-01T00:00:00.000Z' });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
}

describe('ActionsScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders the list of actions', async () => {
    configureBackend('https://backend.example');
    setFetch(makeActionsFetch());

    const { findByTestId } = await render(<ActionsScreen />);
    expect(await findByTestId('actions.list')).toBeTruthy();
    expect(await findByTestId('actions.item.act-summary')).toBeTruthy();
    expect(await findByTestId('actions.item.act-merge')).toBeTruthy();
  });

  it('runs a non-side-effect action immediately without confirmation', async () => {
    configureBackend('https://backend.example');
    const fetchMock = makeActionsFetch();
    setFetch(fetchMock);

    const { findByTestId, queryByTestId } = await render(<ActionsScreen />);
    const safe = await findByTestId('actions.item.act-summary');

    await act(async () => {
      fireEvent.press(safe);
    });

    const runCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/api/actions/act-summary/run'),
    );
    expect(runCall).toBeTruthy();
    expect(runCall?.[1]?.method).toBe('POST');
    expect(queryByTestId('actions.confirm')).toBeNull();
  });

  it('opens a confirmation modal for side-effect actions and runs only after confirm', async () => {
    configureBackend('https://backend.example');
    const fetchMock = makeActionsFetch();
    setFetch(fetchMock);

    const { findByTestId, getByTestId } = await render(<ActionsScreen />);
    const danger = await findByTestId('actions.item.act-merge');

    await act(async () => {
      fireEvent.press(danger);
    });

    // Modal is visible but run not yet triggered.
    expect(getByTestId('actions.confirm')).toBeTruthy();
    let runCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/api/actions/act-merge/run'),
    );
    expect(runCall).toBeUndefined();

    await act(async () => {
      fireEvent.press(getByTestId('actions.confirm.ok'));
    });

    runCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/api/actions/act-merge/run'),
    );
    expect(runCall).toBeTruthy();
    expect(runCall?.[1]?.method).toBe('POST');
  });

  it('cancel in the confirmation modal does not run the action', async () => {
    configureBackend('https://backend.example');
    const fetchMock = makeActionsFetch();
    setFetch(fetchMock);

    const { findByTestId, getByTestId } = await render(<ActionsScreen />);
    const danger = await findByTestId('actions.item.act-merge');

    await act(async () => {
      fireEvent.press(danger);
    });
    await act(async () => {
      fireEvent.press(getByTestId('actions.confirm.cancel'));
    });

    const runCall = fetchMock.mock.calls.find(
      (c) => String(c[0]).endsWith('/api/actions/act-merge/run'),
    );
    expect(runCall).toBeUndefined();
  });
});
