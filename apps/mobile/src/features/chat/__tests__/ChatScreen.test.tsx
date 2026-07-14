import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { runInAction } from 'mobx';
import type { QueuedMessage, RealtimeEnvelope } from '@pi-agents/contracts';
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

function queuedMessage(id: string, text: string, position: number): QueuedMessage {
  return {
    id,
    chatId: 'chat-1',
    taskId: 'task-1',
    kind: 'follow_up',
    text,
    position,
    status: 'pending',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
  };
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

  it('creates the next writable Task in the same implementation Chat', async () => {
    const { api, store } = createTestStore();
    api.getChat
      .mockResolvedValueOnce({
        id: 'chat-1', projectId: 'project-1', title: 'Sequential work', mode: 'implementation' as const,
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .mockResolvedValue({
        id: 'chat-1', projectId: 'project-1', title: 'Sequential work', mode: 'implementation' as const,
        activeTaskId: 'task-2', updatedAt: '2026-01-01T00:01:00.000Z',
      });
    jest.spyOn(ApiClient.prototype, 'getChat')
      .mockResolvedValueOnce({
        id: 'chat-1', projectId: 'project-1', title: 'Sequential work', mode: 'implementation',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
      .mockResolvedValue({
        id: 'chat-1', projectId: 'project-1', title: 'Sequential work', mode: 'implementation',
        activeTaskId: 'task-2', updatedAt: '2026-01-01T00:01:00.000Z',
      });
    const createTask = jest.spyOn(ApiClient.prototype, 'createTaskForChat').mockResolvedValue({
      id: 'task-2', projectId: 'project-1', title: 'Second change', mode: 'implementation',
      status: 'created', branchName: 'agents/task-2', worktreePath: '/tmp/task-2',
      changedFiles: 0, updatedAt: '2026-01-01T00:01:00.000Z',
    });

    const screen = await render(
      <RootStoreProvider store={store}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('chat.screen.nextTask')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('chat.screen.nextTaskTitle'), 'Second change');
    await waitFor(() => expect(screen.getByTestId('chat.screen.nextTaskTitle').props.value).toBe('Second change'));
    await waitFor(() => expect(screen.getByTestId('chat.screen.createNextTask').props.accessibilityState?.disabled).toBeFalsy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.screen.createNextTask'));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(createTask).toHaveBeenCalledWith('chat-1', {
      title: 'Second change',
      mode: 'implementation',
    }));
    await waitFor(() => expect(screen.queryByTestId('chat.screen.nextTask')).toBeNull());
    expect(screen.getByTestId('chat.screen.activeTask').props.children.join('')).toContain('task-2');
  });

  it('lets the user inspect, reorder, remove, and clear queued follow-ups', async () => {
    const first = queuedMessage('queue-1', 'Сначала проверь сборку', 1);
    const second = queuedMessage('queue-2', 'Затем обнови документацию', 2);
    jest.spyOn(ApiClient.prototype, 'getQueue').mockResolvedValue([first, second]);
    const reorder = jest.spyOn(ApiClient.prototype, 'reorderQueue').mockResolvedValue([
      { ...second, position: 1 },
      { ...first, position: 2 },
    ]);
    const remove = jest.spyOn(ApiClient.prototype, 'removeQueueItem').mockResolvedValue({ ok: true });
    const clear = jest.spyOn(ApiClient.prototype, 'clearQueue').mockResolvedValue({ ok: true });
    const { store } = createTestStore();
    const screen = await render(
      <RootStoreProvider store={store}>
        <ChatScreen chatId="chat-1" />
      </RootStoreProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.queue.toggle'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText('Сначала проверь сборку')).toBeTruthy());
    expect(screen.getByText('Затем обнови документацию')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.queue.down.queue-1'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(reorder).toHaveBeenCalledWith('chat-1', ['queue-2', 'queue-1']));

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.queue.remove.queue-1'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(remove).toHaveBeenCalledWith('chat-1', 'queue-1'));
    await waitFor(() => expect(screen.queryByText('Сначала проверь сборку')).toBeNull());

    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.queue.clear'));
    });
    await waitFor(() => expect(screen.getByTestId('chat.queue.clearConfirmation')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('chat.queue.clearConfirm'));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(clear).toHaveBeenCalledWith('chat-1'));
    await waitFor(() => expect(screen.getByTestId('chat.queue.empty')).toBeTruthy());
  });
});
