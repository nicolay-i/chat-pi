import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { runInAction } from 'mobx';
import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { RootStoreProvider } from '@/providers/RootStoreProvider';
import { createRootStore } from '@/stores/rootStore';
import { eventReducer, initialEventReducerState } from '@/state/eventReducer';
import { ApiClient } from '@/api/client';
import { ChatScreen } from '../ChatScreen';

function envelope(
  id: string,
  sequence: number,
  type: RealtimeEnvelope['type'],
  payload: unknown,
): RealtimeEnvelope {
  return {
    id,
    sequence,
    stream: 'chat',
    streamId: 'chat-1',
    type,
    payload,
    createdAt: '2026-01-01T10:00:00.000Z',
  };
}

function createTestStore() {
  const api = {
    getChat: jest.fn(async () => ({
      id: 'chat-1', projectId: 'project-1', title: 'Chat', mode: 'implementation' as const,
      activeTaskId: 'task-1',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })),
    getTask: jest.fn(async () => ({
      id: 'task-1', projectId: 'project-1', title: 'Task', mode: 'implementation' as const,
      status: 'needs_review' as const, branchName: 'agents/task-1', worktreePath: '/tmp/task-1',
      changedFiles: 0, updatedAt: '2026-01-01T00:00:00.000Z',
    })),
    sendMessage: jest.fn(async () => ({ ok: true as const })),
    abortChat: jest.fn(async () => ({ ok: true as const })),
  };
  const store = createRootStore({
    apiClientFactory: (() => api) as never,
    realtimeFactory: (options) => ({
      start: jest.fn(() => options.onState?.('open')),
      stop: jest.fn(),
    }),
    storage: {
      load: async () => 'https://backend.example',
      save: async () => undefined,
      clear: async () => undefined,
    },
  });
  store.backend.baseUrl = 'https://backend.example';
  return { api, store };
}

describe('ChatScreen', () => {
  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  it('renders streaming, tool calls, queue and active task through the single MobX session', async () => {
    const { store } = createTestStore();
    const chat = store.chats.getOrCreate('chat-1');
    chat.activeTaskId = 'task-1';
    chat.connectionStatus = 'open';
    chat.projection = [
      envelope('r1', 1, 'run.started', { chatId: 'chat-1' }),
      envelope('m1', 2, 'message.created', { chatId: 'chat-1', id: 'assistant-1', role: 'assistant', text: 'Working', createdAt: '2026-01-01T10:00:00.000Z' }),
      envelope('q1', 3, 'queue.updated', { chatId: 'chat-1' }),
      envelope('tool1', 4, 'tool.started', { chatId: 'chat-1', tool: 'edit_file' }),
    ].reduce(eventReducer, initialEventReducerState);

    const screen = await render(
      <RootStoreProvider store={store}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );

    expect(screen.getByText('Working')).toBeTruthy();
    expect(screen.getByTestId('chat.screen.streamingCursor')).toBeTruthy();
    expect(screen.getByTestId('chat.toolCard')).toBeTruthy();
    expect(screen.getByTestId('chat.screen.connection').props.children.join('')).toContain('очередь: 1');
    expect(screen.getByTestId('chat.screen.activeTask').props.children.join('')).toContain('task-1');
  });

  it('prefers the loaded Chat title over an opaque Chat id in the header', async () => {
    const { store } = createTestStore();
    jest.spyOn(ApiClient.prototype, 'getChat').mockResolvedValue({
      id: 'chat-1', projectId: 'project-1', title: 'Проверка интеграции', mode: 'implementation',
      activeTaskId: 'task-1', updatedAt: '2026-01-01T00:00:00.000Z',
    });

    const screen = await render(
      <RootStoreProvider store={store}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('chat.screen.title').props.children).toBe('Проверка интеграции'));
  });

  it('hydrates the Chat after an asynchronously restored backend URL becomes available', async () => {
    const { api, store } = createTestStore();
    store.backend.baseUrl = null;
    store.backend.restored = true;
    const screen = await render(
      <RootStoreProvider store={store}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );

    expect(api.getChat).not.toHaveBeenCalled();
    await act(async () => {
      runInAction(() => {
        store.backend.baseUrl = 'https://backend.example';
      });
    });

    await waitFor(() => expect(api.getChat).toHaveBeenCalledWith('chat-1'));
    expect(screen.queryByTestId('chat.screen.error')).toBeNull();
  });

  it('offers steer or follow-up while a run is active and sends the selected command', async () => {
    const { api, store } = createTestStore();
    const chat = store.chats.getOrCreate('chat-1');
    chat.projection = eventReducer(
      initialEventReducerState,
      envelope('r1', 1, 'run.started', { chatId: 'chat-1' }),
    );
    const screen = await render(
      <RootStoreProvider store={store}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );

    const input = screen.getByLabelText('Сообщение');
    fireEvent.changeText(input, 'Проверь этот файл');
    await waitFor(() => expect(input.props.value).toBe('Проверь этот файл'));
    fireEvent.press(screen.getByTestId('chat.composer.send'));
    await waitFor(() => expect(screen.getByTestId('chat.screen.runChoice')).toBeTruthy());

    fireEvent.press(screen.getByTestId('chat.screen.chooseSteer'));
    await waitFor(() => expect(screen.getByLabelText('Режим направить')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.composer.send'));
      await Promise.resolve();
    });
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(chat.sending).toBe(false));
    expect(api.sendMessage.mock.calls[0][1]).toMatchObject({
      text: 'Проверь этот файл',
      behavior: 'steer',
    });
  });

  it('does not submit an empty message', async () => {
    const { api, store } = createTestStore();
    const screen = await render(
      <RootStoreProvider store={store}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );
    fireEvent.press(screen.getByTestId('chat.composer.send'));
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});
