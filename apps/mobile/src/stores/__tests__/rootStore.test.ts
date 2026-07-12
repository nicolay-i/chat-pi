import { createRootStore } from '../rootStore';

const capabilities = {
  apiVersion: '1.0.0',
  piAvailable: true,
  gitAvailable: true,
  supportsWorktrees: true,
  supportsSse: true,
  supportsWebSocket: false,
  supportsPackageInstall: true,
  supportsVscodeWeb: false,
  supportsIgnis: false,
};

describe('createRootStore', () => {
  it('uses injected dependencies and disposes the active realtime subscription', async () => {
    const stop = jest.fn();
    const start = jest.fn();
    const apiClientFactory = jest.fn(() => ({
      getHealth: async () => ({ ok: true }),
      getCapabilities: async () => capabilities,
      bootstrapChat: async () => ({
        id: 'chat-1', projectId: 'project-1', title: 'Chat', mode: 'discussion' as const,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    }));
    const store = createRootStore({
      apiClientFactory: apiClientFactory as never,
      realtimeFactory: () => ({ start, stop }),
      storage: { load: async () => null, save: async () => undefined, clear: async () => undefined },
      clock: () => 100,
    });

    await store.backend.connect('https://backend.example');
    const chat = await store.chats.bootstrap();

    expect(chat.id).toBe('chat-1');
    expect(start).toHaveBeenCalledTimes(1);
    store.dispose();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('restores the saved URL and reset closes realtime before clearing storage', async () => {
    const stop = jest.fn();
    const clear = jest.fn(async () => undefined);
    let onState: ((state: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error') => void) | undefined;
    const store = createRootStore({
      apiClientFactory: (() => ({
        getHealth: async () => ({ ok: true }),
        getCapabilities: async () => capabilities,
      })) as never,
      realtimeFactory: (options) => {
        onState = options.onState;
        return { start: jest.fn(), stop };
      },
      storage: {
        load: async () => 'https://saved.example',
        save: async () => undefined,
        clear,
      },
      clock: () => 100,
    });

    await store.backend.restore();
    expect(store.backend.baseUrl).toBe('https://saved.example');
    expect(store.backend.restored).toBe(true);

    store.chats.open('chat-1');
    onState?.('open');
    expect(store.connection.status).toBe('open');

    await store.reset();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(store.connection.status).toBe('idle');
    expect(store.backend.baseUrl).toBeNull();
  });

  it('keeps independent session projections while another chat is active and evicts explicitly', () => {
    const subscriptions = new Map<string, { onEvent: (event: { id: string; sequence: number; stream: 'chat'; streamId: string; type: 'message.created'; payload: unknown; createdAt: string }) => void; stop: jest.Mock }>();
    const store = createRootStore({
      realtimeFactory: (options) => {
        const stop = jest.fn();
        subscriptions.set(options.url, { onEvent: options.onEvent as never, stop });
        return { start: jest.fn(), stop };
      },
    });
    store.backend.baseUrl = 'https://backend.example';

    const chatA = store.chats.open('A');
    const chatB = store.chats.open('B');
    const aSubscription = subscriptions.get('https://backend.example/api/chats/A/events');
    expect(aSubscription).toBeTruthy();

    aSubscription!.onEvent({
      id: 'event-A', sequence: 1, stream: 'chat', streamId: 'A', type: 'message.created',
      payload: { chatId: 'A', id: 'message-A', role: 'assistant', text: 'background update', createdAt: '2026-01-01T00:00:00.000Z' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const bSubscription = subscriptions.get('https://backend.example/api/chats/B/events');
    bSubscription!.onEvent({
      id: 'event-B', sequence: 2, stream: 'chat', streamId: 'B', type: 'message.created',
      payload: { chatId: 'B', id: 'message-B', role: 'assistant', text: 'foreground update', createdAt: '2026-01-01T00:00:01.000Z' },
      createdAt: '2026-01-01T00:00:01.000Z',
    });

    expect(chatA.messages[0]?.text).toBe('background update');
    expect(chatB.messages[0]?.text).toBe('foreground update');
    expect(chatA.projection.lastSequenceByStream['chat:A']).toBe(1);
    expect(chatB.projection.lastSequenceByStream['chat:B']).toBe(2);
    expect(store.chats.getOrCreate('A')).toBe(chatA);

    store.chats.evict('A');
    expect(aSubscription!.stop).toHaveBeenCalledTimes(1);
    expect(store.chats.items.has('A')).toBe(false);
  });

  it('keeps an active task subscribed after its chat screen closes', async () => {
    const callbacks = new Map<string, (event: { id: string; sequence: number; type: string; payload: unknown }) => void>();
    const stops = new Map<string, jest.Mock>();
    const store = createRootStore({
      apiClientFactory: (() => ({
        getChat: async () => ({
          id: 'chat-1', projectId: 'project-1', title: 'Implementation', mode: 'implementation' as const,
          activeTaskId: 'task-1', updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        getTask: async () => ({
          id: 'task-1', projectId: 'project-1', title: 'Implementation', mode: 'implementation' as const,
          status: 'running' as const, branchName: 'agents/task-1', worktreePath: '/tmp/task-1',
          changedFiles: 0, updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      })) as never,
      realtimeFactory: (options) => {
        const stop = jest.fn();
        callbacks.set(options.url, options.onEvent as never);
        stops.set(options.url, stop);
        return { start: jest.fn(), stop };
      },
    });
    store.backend.baseUrl = 'https://backend.example';

    const chat = await store.chats.hydrate('chat-1');
    await Promise.resolve();
    expect(store.tasks.get('task-1')?.isRunning).toBe(true);
    expect(callbacks.has('https://backend.example/api/tasks/task-1/events')).toBe(true);

    chat.close();
    callbacks.get('https://backend.example/api/tasks/task-1/events')!({
      id: 'task-finished', sequence: 1, type: 'task.status.changed',
      payload: { taskId: 'task-1', status: 'needs_review' },
    });

    expect(store.tasks.get('task-1')?.status).toBe('needs_review');
    expect(stops.get('https://backend.example/api/tasks/task-1/events')).toHaveBeenCalledTimes(1);
  });

  it('dispatches all chat commands through the session and retries a failed optimistic message', async () => {
    const sendMessage = jest.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ ok: true });
    const abortChat = jest.fn(async () => ({ ok: true }));
    const store = createRootStore({
      apiClientFactory: (() => ({ sendMessage, abortChat })) as never,
      clock: () => Date.parse('2026-01-01T00:00:00.000Z'),
    });
    store.backend.baseUrl = 'https://backend.example';
    const chat = store.chats.getOrCreate('chat-1');

    expect(await chat.send('retry me')).toBe(false);
    const failed = chat.messages[0];
    expect(failed?.status).toBe('failed');
    expect(await chat.retryMessage(failed!.id)).toBe(true);

    await chat.send('follow', 'follow_up');
    await chat.send('steer', 'steer');
    await chat.send('replace', 'abort_and_replace');
    expect(await chat.abort()).toBe(true);

    expect(sendMessage.mock.calls.map((call) => call[1].behavior)).toEqual([
      'send', 'send', 'follow_up', 'steer', 'abort_and_replace',
    ]);
    expect(sendMessage.mock.calls.every((call) => call[0] === 'chat-1')).toBe(true);
    expect(abortChat).toHaveBeenCalledWith('chat-1');
  });
});
