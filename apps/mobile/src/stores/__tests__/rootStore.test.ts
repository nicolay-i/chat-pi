import { createRootStore } from '../rootStore';

const capabilities = {
  apiVersion: '1.0.0',
  piAvailable: true,
  gitAvailable: true,
  supportsWorktrees: true,
  supportsSse: true,
  supportsWebSocket: false,
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

  it('migrates a legacy single baseUrl into the server registry', async () => {
    const savedConnections: { serverId: string; name: string; baseUrl: string }[] = [];
    const store = createRootStore({
      storage: {
        load: async () => 'https://legacy.example/',
        save: async () => undefined,
        clear: async () => undefined,
        loadConnections: async () => [],
        saveConnections: async (connections) => { savedConnections.push(...connections); },
      },
    });

    await store.backend.restore();

    expect(store.backend.connections).toHaveLength(1);
    expect(store.backend.baseUrl).toBe('https://legacy.example');
    expect(store.backend.activeServerId).toMatch(/^legacy-[0-9a-f]+$/);
    expect(savedConnections).toEqual([
      {
        serverId: store.backend.activeServerId,
        name: 'legacy.example',
        baseUrl: 'https://legacy.example',
      },
    ]);
  });

  it('continues to setup when reading the saved URL does not respond', async () => {
    jest.useFakeTimers();
    const store = createRootStore({
      storage: {
        load: () => new Promise<string | null>(() => undefined),
        save: async () => undefined,
        clear: async () => undefined,
      },
    });

    const restoring = store.backend.restore();
    await jest.advanceTimersByTimeAsync(3_000);
    await restoring;

    expect(store.backend.baseUrl).toBeNull();
    expect(store.backend.restored).toBe(true);
    expect(store.backend.error).toBe('Saved backend connection did not respond in time');
    store.dispose();
    jest.useRealTimers();
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

  it('keeps equal chat ids isolated when they belong to different servers', () => {
    const callbacks = new Map<string, (event: unknown) => void>();
    const store = createRootStore({
      realtimeFactory: (options) => {
        callbacks.set(options.url, options.onEvent as never);
        return { start: jest.fn(() => options.onState?.('open')), stop: jest.fn() };
      },
    });
    store.backend.servers.set('server-a', {
      serverId: 'server-a', name: 'A', baseUrl: 'https://a.example', capabilities: null,
      status: 'connected', latencyMs: 1, error: null, lastSuccessfulAt: null,
    });
    store.backend.servers.set('server-b', {
      serverId: 'server-b', name: 'B', baseUrl: 'https://b.example', capabilities: null,
      status: 'connected', latencyMs: 1, error: null, lastSuccessfulAt: null,
    });
    store.backend.activate('server-a');

    const first = store.chats.open('same-chat', 'server-a');
    const second = store.chats.open('same-chat', 'server-b');
    callbacks.get('https://a.example/api/chats/same-chat/events')!({
      id: 'a-event', sequence: 1, stream: 'chat', streamId: 'same-chat', type: 'message.created',
      payload: { chatId: 'same-chat', id: 'a-message', role: 'assistant', text: 'A', createdAt: '2026-01-01T00:00:00.000Z' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    callbacks.get('https://b.example/api/chats/same-chat/events')!({
      id: 'b-event', sequence: 1, stream: 'chat', streamId: 'same-chat', type: 'message.created',
      payload: { chatId: 'same-chat', id: 'b-message', role: 'assistant', text: 'B', createdAt: '2026-01-01T00:00:00.000Z' },
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    expect(first.messages.map((message) => message.text)).toEqual(['A']);
    expect(second.messages.map((message) => message.text)).toEqual(['B']);
    expect(store.chats.items.size).toBe(2);
  });

  it('keeps the active node usable when another node is offline', async () => {
    const factory = jest.fn((baseUrl: string) => ({
      getHealth: async () => {
        if (baseUrl.includes('offline')) throw new Error('network unavailable');
        return { ok: true };
      },
      getCapabilities: async () => ({ ...capabilities, serverId: 'server-a' }),
    }));
    const store = createRootStore({ apiClientFactory: factory as never });

    const first = await store.backend.connect('https://active.example');
    const second = await store.backend.connect('https://offline.example');

    expect(first?.status).toBe('connected');
    expect(second?.status).toBe('offline');
    expect(store.backend.activeServerId).toBe('server-a');
    expect(store.backend.status).toBe('connected');
    expect(store.backend.connections).toHaveLength(2);
  });

  it('passes and persists a per-server bearer credential', async () => {
    const saved = new Map<string, string>();
    const tokens: Array<string | undefined> = [];
    const store = createRootStore({
      apiClientFactory: ((baseUrl: string, _serverId?: string, token?: string) => {
        tokens.push(token);
        return {
          getHealth: async () => ({ ok: true }),
          getCapabilities: async () => ({ ...capabilities, serverId: 'secure-node', authRequired: true }),
          checkAuth: async () => ({ ok: true as const }),
        };
      }) as never,
      storage: {
        load: async () => null,
        save: async () => undefined,
        clear: async () => undefined,
        loadCredential: async (serverId) => saved.get(serverId) ?? null,
        saveCredential: async (serverId, token) => { saved.set(serverId, token); },
        clearCredential: async (serverId) => { saved.delete(serverId); },
      },
    });

    const connection = await store.backend.connect('https://secure.example', 'secret-token');

    expect(connection?.status).toBe('connected');
    expect(tokens).toEqual(['secret-token']);
    expect(saved.get('secure-node')).toBe('secret-token');
    expect(store.backend.getAuthHeaders('secure-node')).toEqual({ authorization: 'Bearer secret-token' });
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
