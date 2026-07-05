import { act } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { RealtimeEnvelope, EventType } from '@pi-agents/contracts';

type Captured = {
  onEvent: ((event: RealtimeEnvelope) => void) | null;
};

const captured: Captured = { onEvent: null };

jest.mock('@/state/realtimeClient', () => ({
  createRealtimeClient: (options: {
    onEvent: (event: RealtimeEnvelope) => void;
    onState?: (state: string) => void;
  }) => {
    captured.onEvent = options.onEvent;
    return {
      start: () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cs = require('@/state/connectionStore') as typeof import('@/state/connectionStore');
        cs.connectionActions.setStatus('open');
        options.onState?.('open');
      },
      stop: () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cs = require('@/state/connectionStore') as typeof import('@/state/connectionStore');
        cs.connectionActions.setStatus('idle');
      },
      getLastEventId: () => null,
      getState: () => 'open',
    };
  },
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { connectionActions } from '@/state/connectionStore';
import { backendActions } from '@/state/backendStore';
import { ChatThread } from '../ChatThread';

function envelope(
  id: string,
  type: EventType,
  payload: unknown,
): RealtimeEnvelope {
  return { id, stream: 'chat', streamId: 'chat-1', type, payload, createdAt: '2026-01-01T10:00:00.000Z' };
}

function emit(event: RealtimeEnvelope): void {
  const fn = captured.onEvent;
  if (!fn) throw new Error('realtime client not started');
  act(() => {
    fn(event);
  });
}

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const originalFetch = globalThis.fetch;
function setFetch(fn: FetchImpl): void {
  (globalThis as { fetch: FetchImpl }).fetch = fn;
}
function restoreFetch(): void {
  (globalThis as { fetch: FetchImpl }).fetch = originalFetch;
}
const jsonRes = (body: unknown): Response => ({ ok: true, json: async () => body }) as unknown as Response;

describe('ChatThread', () => {
  beforeEach(() => {
    captured.onEvent = null;
    backendActions.setBaseUrl('https://backend.example');
    connectionActions.setStatus('idle');
  });

  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('hides offline banner and shows empty demo toolcard when connected with no messages', async () => {
    const { queryByTestId, findByTestId } = await render(<ChatThread chatId="c1" />);
    await findByTestId('chat.thread.connectionPill');
    expect(queryByTestId('chat.thread.offlineBanner')).toBeNull();
    expect(queryByTestId('chat.thread.toolCardDemo')).toBeTruthy();
  });

  it('renders messages emitted through the realtime client', async () => {
    const { findByText, queryByTestId } = await render(<ChatThread chatId="c1" />);
    emit(
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'u1',
        role: 'user',
        text: 'Привет',
        createdAt: '2026-01-01T10:00:00.000Z',
      }),
    );
    await findByText('Привет');
    emit(
      envelope('02J', 'message.created', {
        chatId: 'c1',
        id: 'a1',
        role: 'assistant',
        text: '',
        createdAt: '2026-01-01T10:00:01.000Z',
      }),
    );
    emit(envelope('03J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: 'Здравствуйте' }));
    await findByText('Здравствуйте');
    // Streaming cursor visible because the assistant message is incomplete + open.
    expect(queryByTestId('chat.thread.streamingCursor')).toBeTruthy();
  });

  it('calls fetch on send button press', async () => {
    const fetchMock = jest.fn(async () => jsonRes({ ok: true }));
    setFetch(fetchMock);

    const { getByTestId, getByLabelText } = await render(<ChatThread chatId="c1" />);
    const messageInput = getByLabelText('Сообщение');
    await act(async () => {
      fireEvent.changeText(messageInput, 'Напиши тесты');
    });
    const sendBtn = getByTestId('chat.composer.send');
    await act(async () => {
      fireEvent.press(sendBtn);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/chats/c1/messages');
    expect(JSON.parse((init as RequestInit).body as string).text).toBe('Напиши тесты');
  });

  it('renders the composer mode toggle and contextual quick action chips', async () => {
    const { getByTestId, getByText } = await render(<ChatThread chatId="c1" />);
    expect(getByTestId('chat.composer.modeToggle')).toBeTruthy();
    // Always-visible chips (no task): Улучшить, Тесты, Commit.
    expect(getByText('Улучшить')).toBeTruthy();
    expect(getByText('Тесты')).toBeTruthy();
    expect(getByText('Commit')).toBeTruthy();
  });

  it('renders quick action chips disabled when there is no active task', async () => {
    const { getByLabelText } = await render(<ChatThread chatId="c1" />);
    const improve = getByLabelText('Улучшить');
    const tests = getByLabelText('Тесты');
    const commit = getByLabelText('Commit');
    expect((improve.props as { accessibilityState?: { disabled?: boolean } }).accessibilityState
      ?.disabled).toBe(true);
    expect((tests.props as { accessibilityState?: { disabled?: boolean } }).accessibilityState
      ?.disabled).toBe(true);
    expect((commit.props as { accessibilityState?: { disabled?: boolean } }).accessibilityState
      ?.disabled).toBe(true);
  });
});
