import { act } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from 'expo-router';
import SetupScreen from '../setup';
import { rootStore } from '@/stores/rootStore';

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
  supportsPackageInstall: true,
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
  beforeEach(() => {
    rootStore.chat.close();
    jest.spyOn(rootStore.chat, 'open').mockImplementation(() => undefined);
    rootStore.backend.baseUrl = null;
    rootStore.backend.capabilities = null;
    rootStore.backend.status = 'idle';
    rootStore.backend.latencyMs = null;
    rootStore.backend.error = null;
  });

  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders the backend URL input and test-connection button', async () => {
    const { getByTestId } = await render(<SetupScreen />);
    expect(getByTestId('setup.backendUrl')).toBeTruthy();
    expect(getByTestId('setup.testConnection')).toBeTruthy();
  });

  it('enables continue and shows diagnostics on a valid mock backend', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/health')) return jsonRes({ ok: true, time: '2026-01-01T00:00:00Z' });
      if (u.endsWith('/api/capabilities')) return jsonRes(VALID_CAPABILITIES);
      if (u.endsWith('/api/chats/bootstrap')) {
        return jsonRes({
          id: 'chat-1',
          projectId: 'project-1',
          title: 'Новый чат',
          mode: 'discussion',
          updatedAt: '2026-01-01T00:00:00Z',
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(fetchMock);

    const { getByTestId, findByText } = await render(<SetupScreen />);
    await typeUrl(getByTestId, 'https://pi.example.internal');

    await act(async () => {
      fireEvent.press(getByTestId('setup.testConnection'));
    });

    expect(await findByText(/Версия API: 1\.2\.3/)).toBeTruthy();

    fireEvent.press(getByTestId('setup.continue'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/chat/chat-1'));
  });

  it('shows server-unreachable error when fetch rejects', async () => {
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));

    const { getByTestId, findByText } = await render(<SetupScreen />);
    await typeUrl(getByTestId, 'https://pi.example.internal');

    await act(async () => {
      fireEvent.press(getByTestId('setup.testConnection'));
    });

    expect(await findByText(/Не удалось подключиться/)).toBeTruthy();
  });

  it('shows invalid-URL error without calling fetch', async () => {
    const fetchMock = jest.fn((): Promise<Response> => Promise.resolve(jsonRes({})));
    setFetch(fetchMock);

    const { getByTestId, findByText } = await render(<SetupScreen />);
    await typeUrl(getByTestId, 'not-a-url');

    await act(async () => {
      fireEvent.press(getByTestId('setup.testConnection'));
    });

    expect(await findByText(/Некорректный URL/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
