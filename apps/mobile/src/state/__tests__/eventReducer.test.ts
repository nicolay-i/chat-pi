import type { RealtimeEnvelope, EventType } from '@pi-agents/contracts';
import {
  eventReducer,
  foldEvents,
  initialEventReducerState,
  type EventReducerState,
} from '../eventReducer';

function envelope(
  id: string,
  type: EventType,
  payload: unknown,
  createdAt = '2026-01-01T00:00:00.000Z',
  streamId = 'chat-1',
): RealtimeEnvelope {
  return {
    id,
    sequence: Number(id.replace(/\D/g, '')),
    stream: 'chat',
    streamId,
    type,
    payload,
    createdAt,
  };
}

function reduceMany(events: RealtimeEnvelope[]): EventReducerState {
  return events.reduce(eventReducer, initialEventReducerState);
}

describe('eventReducer', () => {
  it('is deterministic: same sequence produces deep-equal state across runs', () => {
    const seq: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'm1',
        role: 'user',
        text: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      envelope('02J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: 'Hello' }),
      envelope('03J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: ' world' }),
      envelope('04J', 'task.status.changed', { taskId: 't1', status: 'running' }),
    ];

    const first = reduceMany(seq);
    const second = reduceMany(seq);
    expect(second).toEqual(first);
  });

  it('ignores duplicate ids and stale sequences (state unchanged)', () => {
    const seq: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'm1',
        role: 'user',
        text: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      envelope('02J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: 'X' }),
    ];
    const baseline = reduceMany(seq);

    const replayed = eventReducer(baseline, envelope('01J', 'message.created', {
      chatId: 'c1',
      id: 'dupe',
      role: 'assistant',
      text: 'ignored',
      createdAt: '2026-01-02T00:00:00.000Z',
    }));
    expect(replayed).toEqual(baseline);

    const lowerSequence = eventReducer(baseline, envelope('00J', 'task.status.changed', {
      taskId: 't99',
      status: 'queued',
    }));
    expect(lowerSequence).toEqual(baseline);
  });

  it('keeps cursors independent for different stream identities', () => {
    const chat = envelope('10J', 'task.status.changed', { taskId: 'chat-task', status: 'running' });
    const task = { ...envelope('02J', 'task.status.changed', { taskId: 'task-1', status: 'running' }), stream: 'task' as const, streamId: 'task-1' };
    const staleTask = { ...envelope('01J', 'task.status.changed', { taskId: 'task-1', status: 'queued' }), stream: 'task' as const, streamId: 'task-1' };

    const state = reduceMany([chat, task, staleTask]);

    expect(state.events.map((event) => event.id)).toEqual(['10J', '02J']);
    expect(state.lastSequenceByStream).toEqual({ 'chat:chat-1': 10, 'task:task-1': 2 });
  });

  it('message.created pushes a MessageView into messagesByChat', () => {
    const state = reduceMany([
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'm1',
        role: 'user',
        text: 'hello',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]);
    expect(state.messagesByChat.c1).toHaveLength(1);
    expect(state.messagesByChat.c1[0]).toEqual({
      id: 'm1',
      role: 'user',
      text: 'hello',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('message.delta appends to the last matching assistant message', () => {
    const events: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'a1',
        role: 'assistant',
        text: '',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      envelope('02J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: 'Hel' }),
      envelope('03J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: 'lo' }),
    ];
    const state = reduceMany(events);
    expect(state.messagesByChat.c1[0].text).toBe('Hello');
  });

  it('message.delta replaces streamed text when Pi sends a text_end snapshot', () => {
    const state = reduceMany([
      envelope('01J', 'message.created', {
        chatId: 'c1', id: 'a1', role: 'assistant', text: '', createdAt: '2026-01-01T00:00:00.000Z',
      }),
      envelope('02J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: 'Hello' }),
      envelope('03J', 'message.delta', { chatId: 'c1', messageId: 'a1', delta: 'Hello world', replace: true }),
    ]);

    expect(state.messagesByChat.c1[0].text).toBe('Hello world');
  });

  it('message.delta does not mutate other chats when messageId is missing', () => {
    const state = reduceMany([
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'a1',
        role: 'assistant',
        text: 'A',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      envelope('02J', 'message.delta', { chatId: 'c1', messageId: 'missing', delta: 'X' }),
    ]);
    expect(state.messagesByChat.c1[0].text).toBe('A');
  });

  it('task.status.changed updates taskStatuses', () => {
    const state = reduceMany([
      envelope('01J', 'task.status.changed', { taskId: 't1', status: 'running' }),
      envelope('02J', 'task.status.changed', { taskId: 't1', status: 'merged' }),
    ]);
    expect(state.taskStatuses.t1).toBe('merged');
  });

  it('uses stream context when runtime payload omits duplicate identifiers', () => {
    const state = reduceMany([
      envelope('01J', 'message.created', { messageId: 'assistant-1', role: 'assistant', text: '' }),
      envelope('02J', 'message.delta', { messageId: 'assistant-1', delta: 'Working' }),
      {
        ...envelope('03J', 'task.status.changed', { status: 'running' }),
        stream: 'task' as const,
        streamId: 'task-1',
      },
      envelope('04J', 'queue.updated', { pending: 3 }),
    ]);

    expect(state.messagesByChat['chat-1'][0]).toMatchObject({ id: 'assistant-1', text: 'Working' });
    expect(state.taskStatuses['task-1']).toBe('running');
    expect(state.queueByChat['chat-1']).toBe(3);
  });

  it('message.completed marks a message complete', () => {
    const state = reduceMany([
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'a1',
        role: 'assistant',
        text: 'hi',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      envelope('02J', 'message.completed', { chatId: 'c1', messageId: 'a1' }),
    ]);
    expect(state.messagesByChat.c1[0].complete).toBe(true);
  });

  it('does not throw on malformed payloads and skips the mutation', () => {
    const before = reduceMany([
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'a1',
        role: 'assistant',
        text: 'A',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ]);

    expect(() => {
      eventReducer(before, envelope('02J', 'message.created', null));
      eventReducer(before, envelope('03J', 'message.created', { chatId: 'c1' }));
      eventReducer(before, envelope('04J', 'message.created', {
        chatId: 'c1', id: 'x', role: 'wizard', text: 't', createdAt: 'z',
      }));
      eventReducer(before, envelope('05J', 'message.delta', 'not-an-object'));
      eventReducer(before, envelope('06J', 'task.status.changed', { taskId: 5, status: 'running' }));
      eventReducer(before, envelope('07J', 'task.status.changed', { taskId: 't1' }));
      eventReducer(before, envelope('08J', 'tool.started', { ignored: true }));
    }).not.toThrow();

    const after = eventReducer(before, envelope('02J', 'message.delta', 'bad'));
    expect(after.messagesByChat.c1[0].text).toBe('A');
  });

  it('foldEvents equals manual reduce for the same input', () => {
    const seq: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', {
        chatId: 'c1', id: 'm1', role: 'user', text: 'hi', createdAt: '2026-01-01T00:00:00.000Z',
      }),
      envelope('02J', 'task.status.changed', { taskId: 't1', status: 'queued' }),
    ];
    expect(foldEvents(seq)).toEqual(reduceMany(seq));
  });

  it('preserves arrival order in events[]', () => {
    const seq: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', { chatId: 'c1', id: 'm1', role: 'user', text: 'a', createdAt: 't' }),
      envelope('02J', 'task.status.changed', { taskId: 't1', status: 'running' }),
    ];
    const state = reduceMany(seq);
    expect(state.events.map((e) => e.id)).toEqual(['01J', '02J']);
    expect(state.lastSequenceByStream['chat:chat-1']).toBe(2);
  });
});
