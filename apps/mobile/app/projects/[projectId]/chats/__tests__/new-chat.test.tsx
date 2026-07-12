import { act } from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';

jest.mock('@/navigation', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from '@/navigation';
import NewChatScreen from '../new';

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
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@/test/rootStoreHarness') as typeof import('@/test/rootStoreHarness');
  mod.backendActions.setBaseUrl(url);
}

const CREATED_CHAT = {
  id: 'chat-new',
  projectId: 'project-demo',
  title: 'Build feature',
  mode: 'implementation',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('NewChatScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('shows create-task toggle when implementation mode is selected', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes({})));

    const { getByTestId, queryByTestId } = await render(<NewChatScreen />);
    expect(queryByTestId('newchat.createTaskToggle')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('newchat.mode.implementation'));
    });
    expect(getByTestId('newchat.createTaskToggle')).toBeTruthy();
  });

  it('hides create-task toggle when discussion mode is selected', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes({})));

    const { getByTestId, queryByTestId } = await render(<NewChatScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('newchat.mode.implementation'));
    });
    expect(getByTestId('newchat.createTaskToggle')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('newchat.mode.discussion'));
    });
    expect(queryByTestId('newchat.createTaskToggle')).toBeNull();
  });

  it('sends mode=implementation, createTask=true when toggled and Create pressed', async () => {
    configureBackend('https://backend.example');
    const createMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/api/projects/project-demo/chats') && init?.method === 'POST') {
        return jsonRes(CREATED_CHAT);
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(createMock);

    const { getByTestId } = await render(<NewChatScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('newchat.mode.implementation'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('newchat.createTaskToggle'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('newchat.create'));
    });

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const call = createMock.mock.calls[0];
    const sentBody = JSON.parse(String(call[1].body));
    expect(sentBody.mode).toBe('implementation');
    expect(sentBody.createTask).toBe(true);
    expect(router.replace).toHaveBeenCalledWith('/projects/project-demo/chats/chat-new');
  });

  it('does not send createTask when implementation mode is not toggled', async () => {
    configureBackend('https://backend.example');
    const createMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/api/projects/project-demo/chats') && init?.method === 'POST') {
        return jsonRes(CREATED_CHAT);
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(createMock);

    const { getByTestId } = await render(<NewChatScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('newchat.mode.implementation'));
    });
    await act(async () => {
      fireEvent.press(getByTestId('newchat.create'));
    });

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    const sentBody = JSON.parse(String(createMock.mock.calls[0][1].body));
    expect(sentBody.mode).toBe('implementation');
    expect(sentBody.createTask).toBeUndefined();
  });

  it('disables Create button until a mode is selected', async () => {
    configureBackend('https://backend.example');
    const createMock = jest.fn(async () => jsonRes(CREATED_CHAT));
    setFetch(createMock);

    const { getByTestId } = await render(<NewChatScreen />);
    const createBtn = getByTestId('newchat.create');
    expect(createBtn.props.accessibilityState?.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(getByTestId('newchat.mode.discussion'));
    });
    expect(getByTestId('newchat.create').props.accessibilityState?.disabled).toBeFalsy();
  });
});
