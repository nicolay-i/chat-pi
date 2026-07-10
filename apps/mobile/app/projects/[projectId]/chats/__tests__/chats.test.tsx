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

import { router } from 'expo-router';
import ChatsScreen from '../index';

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

const CHAT = {
  id: 'chat-demo',
  projectId: 'project-demo',
  title: 'Debounce implementation',
  mode: 'implementation',
  activeTaskId: 'task-demo',
  lastMessagePreview: 'Now adding debounce',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function configureBackend(url: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

describe('ChatsScreen', () => {
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

    const { getByTestId } = await render(<ChatsScreen />);
    expect(getByTestId('chats.loading')).toBeTruthy();
  });

  it('renders loaded list with chat title and mode badge', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/api/projects/project-demo/chats')) return jsonRes([CHAT]);
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(fetchMock);

    const { findByTestId, getByText } = await render(<ChatsScreen />);
    expect(await findByTestId('chats.list')).toBeTruthy();
    expect(getByText(CHAT.title)).toBeTruthy();
    expect(getByText('implementation')).toBeTruthy();
  });

  it('renders empty state with CTA when no chats', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));

    const { findByTestId } = await render(<ChatsScreen />);
    expect(await findByTestId('chats.empty')).toBeTruthy();
    expect(await findByTestId('chats.empty.cta')).toBeTruthy();
  });

  it('renders error state with retry when fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));

    const { findByTestId, findByText } = await render(<ChatsScreen />);
    expect(await findByTestId('chats.error')).toBeTruthy();
    expect(await findByText(/network down/)).toBeTruthy();
  });

  it('opens new-chat screen on CTA tap', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));

    const { findByTestId } = await render(<ChatsScreen />);
    const cta = await findByTestId('chats.empty.cta');
    await act(async () => {
      fireEvent.press(cta);
    });
    expect(router.push).toHaveBeenCalledWith('/projects/project-demo/chats/new');
  });
});
