import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { RealtimeHub } from '../RealtimeHub';
import type { RealtimeManagerOptions } from '../RealtimeManager';

function event(id: string, sequence: number): RealtimeEnvelope {
  return {
    id,
    sequence,
    stream: 'chat',
    streamId: 'chat-1',
    type: 'message.created',
    payload: { chatId: 'chat-1', id: `message-${id}`, role: 'assistant', text: id, createdAt: '2026-01-01T00:00:00.000Z' },
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('RealtimeHub', () => {
  it('shares a connection, reference-counts subscribers and suppresses duplicates', () => {
    const connections: Array<{ options: RealtimeManagerOptions; start: jest.Mock; stop: jest.Mock }> = [];
    const hub = new RealtimeHub((options) => {
      const connection = { options, start: jest.fn(), stop: jest.fn() };
      connections.push(connection);
      return connection;
    });
    const first: RealtimeEnvelope[] = [];
    const second: RealtimeEnvelope[] = [];
    const options = { url: 'https://backend.example/api/chats/chat-1/events' };

    const one = hub.subscribeChat('chat-1', options, { onEvent: (value) => first.push(value) });
    const two = hub.subscribeChat('chat-1', options, { onEvent: (value) => second.push(value) });

    expect(connections).toHaveLength(1);
    expect(connections[0].start).toHaveBeenCalledTimes(1);
    connections[0].options.onEvent(event('event-1', 1));
    connections[0].options.onEvent(event('event-1', 1));
    expect(first.map((value) => value.id)).toEqual(['event-1']);
    expect(second.map((value) => value.id)).toEqual(['event-1']);

    one.unsubscribe();
    expect(connections[0].stop).not.toHaveBeenCalled();
    two.unsubscribe();
    expect(connections[0].stop).toHaveBeenCalledTimes(1);
  });

  it('keeps a task subscription alive until its background retain is released', () => {
    const connection = { start: jest.fn(), stop: jest.fn() };
    const hub = new RealtimeHub(() => connection);
    const release = hub.retainTask('task-1', { url: 'https://backend.example/api/tasks/task-1/events' });

    expect(connection.start).toHaveBeenCalledTimes(1);
    release();
    expect(connection.stop).toHaveBeenCalledTimes(1);
  });
});
