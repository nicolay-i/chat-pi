import type { RealtimeEnvelope } from '@pi-agents/contracts';
import {
  RealtimeManager,
  computeBackoffMs,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  type RealtimeState,
} from '../RealtimeManager';

type ConnectOptions = {
  url: string;
  after?: string;
  onEvent: (event: RealtimeEnvelope) => void;
  onStateChange?: (state: 'connecting' | 'open' | 'closed' | 'error') => void;
};

type FakeTransport = {
  close: () => void;
  emit: (event: RealtimeEnvelope) => void;
  openState: () => void;
  errorState: () => void;
  closeState: () => void;
  connect: jest.Mock<() => () => void, [ConnectOptions]>;
  lastOptions: () => ConnectOptions;
};

function makeFakeTransport(): FakeTransport {
  let current: ConnectOptions | null = null;
  const connect = jest.fn((options: ConnectOptions) => {
    current = options;
    options.onStateChange?.('connecting');
    return () => {
      current = null;
      options.onStateChange?.('closed');
    };
  });

  return {
    connect,
    lastOptions: () => {
      if (!current) throw new Error('no active connection');
      return current;
    },
    close: () => {
      if (current) current.onStateChange?.('closed');
      current = null;
    },
    emit: (event) => {
      current?.onEvent(event);
    },
    openState: () => {
      current?.onStateChange?.('open');
    },
    errorState: () => {
      current?.onStateChange?.('error');
    },
    closeState: () => {
      current?.onStateChange?.('closed');
    },
  };
}

function envelope(id: string): RealtimeEnvelope {
  return {
    id,
    stream: 'chat',
    streamId: 'c1',
    type: 'task.status.changed',
    payload: { taskId: 't1', status: 'running' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('computeBackoffMs', () => {
  it('returns BASE_BACKOFF_MS at attempt 0 and grows exponentially', () => {
    expect(computeBackoffMs(0)).toBe(BASE_BACKOFF_MS);
    expect(computeBackoffMs(1)).toBe(BASE_BACKOFF_MS * 2);
    expect(computeBackoffMs(2)).toBe(BASE_BACKOFF_MS * 4);
    expect(computeBackoffMs(3)).toBe(BASE_BACKOFF_MS * 8);
  });

  it('caps at MAX_BACKOFF_MS', () => {
    expect(computeBackoffMs(4)).toBe(BASE_BACKOFF_MS * 16);
    expect(computeBackoffMs(5)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffMs(10)).toBe(MAX_BACKOFF_MS);
    expect(computeBackoffMs(100)).toBe(MAX_BACKOFF_MS);
  });
});

describe('RealtimeManager', () => {
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  it('start() opens the stream via injected connect and surfaces "open"', () => {
    const transport = makeFakeTransport();
    const states: RealtimeState[] = [];
    const manager = new RealtimeManager({
      url: 'https://x/api/chats/c1/events',
      connect: transport.connect,
      onEvent: () => {},
      onState: (s) => states.push(s),
    });

    manager.start();
    expect(transport.connect).toHaveBeenCalledTimes(1);
    transport.openState();
    expect(states).toEqual(['connecting', 'open']);
    expect(manager.getState()).toBe('open');
  });

  it('forwards events to onEvent and tracks lastEventId', () => {
    const transport = makeFakeTransport();
    const seen: RealtimeEnvelope[] = [];
    const manager = new RealtimeManager({
      url: 'https://x',
      connect: transport.connect,
      onEvent: (e) => seen.push(e),
    });

    manager.start();
    transport.emit(envelope('01J'));
    transport.emit(envelope('02J'));

    expect(seen.map((e) => e.id)).toEqual(['01J', '02J']);
    expect(manager.getLastEventId()).toBe('02J');
  });

  it('seeds after from initialAfter', () => {
    const transport = makeFakeTransport();
    const manager = new RealtimeManager({
      url: 'https://x',
      initialAfter: 'seed-1',
      connect: transport.connect,
      onEvent: () => {},
    });

    manager.start();
    expect(transport.lastOptions().after).toBe('seed-1');
  });

  it('reconnects with after=lastEventId after an error using backoff', () => {
    const transport = makeFakeTransport();
    const manager = new RealtimeManager({
      url: 'https://x',
      connect: transport.connect,
      onEvent: () => {},
    });

    manager.start();
    transport.openState();
    transport.emit(envelope('5J'));
    expect(manager.getLastEventId()).toBe('5J');

    expect(transport.connect).toHaveBeenCalledTimes(1);
    transport.errorState();

    expect(manager.getState()).toBe('reconnecting');

    jest.advanceTimersByTime(computeBackoffMs(0));
    expect(transport.connect).toHaveBeenCalledTimes(2);
    expect(transport.lastOptions().after).toBe('5J');
  });

  it('exponential backoff grows with each reconnect attempt', () => {
    const transport = makeFakeTransport();
    const delays: number[] = [];
    const schedule = jest.fn((fn: () => void, ms: number) => {
      delays.push(ms);
      const handle = setTimeout(fn, ms);
      return () => clearTimeout(handle);
    });

    const manager = new RealtimeManager({
      url: 'https://x',
      connect: transport.connect,
      schedule,
      onEvent: () => {},
    });

    manager.start();
    transport.openState();

    // First failure -> attempt 0.
    transport.errorState();
    expect(delays[delays.length - 1]).toBe(computeBackoffMs(0));
    jest.advanceTimersByTime(computeBackoffMs(0));
    expect(transport.connect).toHaveBeenCalledTimes(2);

    // Reconnect attempt itself fails (no openState) -> attempt 1.
    transport.errorState();
    expect(delays[delays.length - 1]).toBe(computeBackoffMs(1));
    jest.advanceTimersByTime(computeBackoffMs(1));
    expect(transport.connect).toHaveBeenCalledTimes(3);
  });

  it('transitions to error after maxReconnectAttempts is exhausted', () => {
    const transport = makeFakeTransport();
    const manager = new RealtimeManager({
      url: 'https://x',
      maxReconnectAttempts: 2,
      connect: transport.connect,
      onEvent: () => {},
    });

    manager.start();
    transport.openState();

    transport.errorState();
    jest.advanceTimersByTime(computeBackoffMs(0));
    expect(manager.getState()).not.toBe('error');

    transport.errorState();
    jest.advanceTimersByTime(computeBackoffMs(1));
    expect(manager.getState()).not.toBe('error');

    transport.errorState();
    expect(manager.getState()).toBe('error');
  });

  it('stop() cancels pending reconnect and closes the stream', () => {
    const transport = makeFakeTransport();
    const manager = new RealtimeManager({
      url: 'https://x',
      connect: transport.connect,
      onEvent: () => {},
    });

    manager.start();
    transport.openState();
    transport.errorState();

    expect(manager.getState()).toBe('reconnecting');
    manager.stop();
    expect(manager.getState()).toBe('idle');

    const callsBefore = transport.connect.mock.calls.length;
    jest.advanceTimersByTime(MAX_BACKOFF_MS);
    expect(transport.connect.mock.calls.length).toBe(callsBefore);
  });

  it('idempotent start() does not open a second stream', () => {
    const transport = makeFakeTransport();
    const manager = new RealtimeManager({
      url: 'https://x',
      connect: transport.connect,
      onEvent: () => {},
    });

    manager.start();
    manager.start();
    manager.start();
    expect(transport.connect).toHaveBeenCalledTimes(1);
  });

  it('clears attempt counter on successful open', () => {
    const transport = makeFakeTransport();
    const manager = new RealtimeManager({
      url: 'https://x',
      maxReconnectAttempts: 3,
      connect: transport.connect,
      onEvent: () => {},
    });

    manager.start();
    transport.openState();

    for (let i = 0; i < 3; i++) {
      transport.errorState();
      jest.advanceTimersByTime(computeBackoffMs(i));
      if (i < 2) transport.openState();
    }
    transport.openState();

    transport.errorState();
    jest.advanceTimersByTime(computeBackoffMs(0));
    expect(manager.getState()).not.toBe('error');
  });
});
