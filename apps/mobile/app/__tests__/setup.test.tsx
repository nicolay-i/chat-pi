import { act } from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';

jest.mock('@/navigation', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from '@/navigation';
import SetupScreen from '../setup';
import { RootStoreProvider } from '@/providers/RootStoreProvider';
import { createRootStore, type RootStore } from '@/stores/rootStore';

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

const VALID_CAPABILITIES = {
  apiVersion: '1.2.3',
  piAvailable: true,
  gitAvailable: true,
  supportsWorktrees: true,
  supportsSse: true,
  supportsWebSocket: false,
  supportsVscodeWeb: false,
  supportsIgnis: false,
};

const typeUrl = async (
  getByTestId: (id: string) => { props: { value?: string } },
  value: string,
): Promise<void> => {
  fireEvent.changeText(getByTestId('setup.backendUrl'), value);
  await waitFor(() => expect(getByTestId('setup.backendUrl').props.value).toBe(value));
};

describe('SetupScreen', () => {
  let store: RootStore;

  beforeEach(() => {
    store = createRootStore({
      realtimeFactory: () => ({ start: jest.fn(), stop: jest.fn() }),
    });
  });

  afterEach(() => {
    store.dispose();
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders the backend URL input and test-connection button', async () => {
    const { getByTestId } = await render(
      <RootStoreProvider store={store}><SetupScreen /></RootStoreProvider>,
    );
    expect(getByTestId('setup.backendUrl')).toBeTruthy();
    expect(getByTestId('setup.testConnection')).toBeTruthy();
  });

  it('opens the projects list after a valid backend is saved', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/health')) return jsonRes({ ok: true, time: '2026-01-01T00:00:00Z' });
      if (u.endsWith('/api/capabilities')) return jsonRes(VALID_CAPABILITIES);
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(fetchMock);

    const { getByTestId, findByText } = await render(
      <RootStoreProvider store={store}><SetupScreen /></RootStoreProvider>,
    );
    await typeUrl(getByTestId, 'https://pi.example.internal');

    await act(async () => {
      fireEvent.press(getByTestId('setup.testConnection'));
    });

    expect(await findByText(/Версия API: 1\.2\.3/)).toBeTruthy();

    fireEvent.press(getByTestId('setup.continue'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projects'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows server-unreachable error when fetch rejects', async () => {
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));

    const { getByTestId, findByText } = await render(
      <RootStoreProvider store={store}><SetupScreen /></RootStoreProvider>,
    );
    await typeUrl(getByTestId, 'https://pi.example.internal');

    await act(async () => {
      fireEvent.press(getByTestId('setup.testConnection'));
    });

    expect(await findByText(/Не удалось подключиться/)).toBeTruthy();
  });

  it('does not query projects before opening the projects list', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/health')) return jsonRes({ ok: true, time: '2026-01-01T00:00:00Z' });
      if (u.endsWith('/api/capabilities')) return jsonRes(VALID_CAPABILITIES);
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(fetchMock);

    const { getByTestId } = await render(
      <RootStoreProvider store={store}><SetupScreen /></RootStoreProvider>,
    );
    await typeUrl(getByTestId, 'https://pi.example.internal');
    await act(async () => {
      fireEvent.press(getByTestId('setup.testConnection'));
    });

    fireEvent.press(getByTestId('setup.continue'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projects'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows invalid-URL error without calling fetch', async () => {
    const fetchMock = jest.fn((): Promise<Response> => Promise.resolve(jsonRes({})));
    setFetch(fetchMock);

    const { getByTestId, findByText } = await render(
      <RootStoreProvider store={store}><SetupScreen /></RootStoreProvider>,
    );
    await typeUrl(getByTestId, 'not-a-url');

    await act(async () => {
      fireEvent.press(getByTestId('setup.testConnection'));
    });

    expect(await findByText(/Некорректный URL/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
