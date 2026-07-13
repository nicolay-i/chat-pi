import type { RealtimeEnvelope } from '@pi-agents/contracts';
import {
  connectNativeEventStream,
  type NativeEventSourceFactory,
} from '../eventStreamNative';

type Listener = (event: { type: string; data?: string | null }) => void;

type FakeEventSource = {
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  close: jest.Mock;
  emit: (type: string, data?: string | null) => void;
};

function createFakeEventSource(): FakeEventSource {
  const listeners = new Map<string, Listener>();
  return {
    addEventListener: jest.fn((type: string, listener: Listener) => listeners.set(type, listener)),
    removeEventListener: jest.fn((type: string) => listeners.delete(type)),
    close: jest.fn(),
    emit: (type, data) => listeners.get(type)?.({ type, data }),
  };
}

const envelope: RealtimeEnvelope = {
  id: 'event-1',
  sequence: 1,
  stream: 'chat',
  streamId: 'chat-1',
  type: 'message.created',
  payload: { chatId: 'chat-1', id: 'message-1', role: 'assistant', text: 'hello' },
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('native event stream', () => {
  it('uses the native transport and delegates reconnects to RealtimeManager', () => {
    const source = createFakeEventSource();
    const factory = jest.fn(() => source) as unknown as NativeEventSourceFactory;
    const states: string[] = [];
    const events: RealtimeEnvelope[] = [];
    const close = connectNativeEventStream({
      url: 'https://backend.example/api/chats/chat-1/events',
      afterSequence: 41,
      onEvent: (event) => events.push(event),
      onStateChange: (state) => states.push(state),
    }, factory);

    expect(factory).toHaveBeenCalledWith(
      'https://backend.example/api/chats/chat-1/events?afterSequence=41',
      { pollingInterval: 0, timeoutBeforeConnection: 0 },
    );
    expect(states).toEqual(['connecting']);

    source.emit('open');
    source.emit('message', JSON.stringify(envelope));
    source.emit('error');
    expect(events).toEqual([envelope]);
    expect(states).toEqual(['connecting', 'open', 'error']);

    close();
    expect(source.close).toHaveBeenCalledTimes(1);
    expect(source.removeEventListener).toHaveBeenCalledTimes(3);
    expect(states).toEqual(['connecting', 'open', 'error', 'closed']);
  });

  it('turns malformed native messages into a reconnectable error', () => {
    const source = createFakeEventSource();
    const states: string[] = [];
    connectNativeEventStream({
      url: 'https://backend.example/events',
      onEvent: jest.fn(),
      onStateChange: (state) => states.push(state),
    }, (() => source) as unknown as NativeEventSourceFactory);

    source.emit('message', '{not json');
    expect(states).toEqual(['connecting', 'error']);
  });
});
