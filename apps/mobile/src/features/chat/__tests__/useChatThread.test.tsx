import type { RealtimeEnvelope, EventType } from '@pi-agents/contracts';
import { foldEvents } from '@/state/eventReducer';

function envelope(
  id: string,
  type: EventType,
  payload: unknown,
  createdAt = '2026-01-01T00:00:00.000Z',
  streamId = 'chat-1',
): RealtimeEnvelope {
  return { id, stream: 'chat', streamId, type, payload, createdAt };
}

describe('chat thread scenario (eventReducer integration)', () => {
  it('assembles a user message + streamed assistant reply from created+deltas', () => {
    const events: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'm-user-1',
        role: 'user',
        text: 'Напиши debounce',
        createdAt: '2026-01-01T10:00:00.000Z',
      }),
      envelope('02J', 'message.created', {
        chatId: 'c1',
        id: 'm-assistant-1',
        role: 'assistant',
        text: '',
        createdAt: '2026-01-01T10:00:01.000Z',
      }),
      envelope('03J', 'message.delta', { chatId: 'c1', messageId: 'm-assistant-1', delta: 'Вот ' }),
      envelope('04J', 'message.delta', { chatId: 'c1', messageId: 'm-assistant-1', delta: 'реализация' }),
    ];

    const state = foldEvents(events);
    const messages = state.messagesByChat['c1'];
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', text: 'Напиши debounce' });
    expect(messages[1]).toMatchObject({ role: 'assistant', text: 'Вот реализация' });
  });

  it('marks the assistant message complete on message.completed', () => {
    const events: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', {
        chatId: 'c1',
        id: 'a1',
        role: 'assistant',
        text: 'hi',
        createdAt: '2026-01-01T10:00:00.000Z',
      }),
      envelope('02J', 'message.completed', { chatId: 'c1', messageId: 'a1' }),
    ];
    const state = foldEvents(events);
    expect(state.messagesByChat['c1'][0].complete).toBe(true);
  });

  it('keeps messages for different chats isolated', () => {
    const events: RealtimeEnvelope[] = [
      envelope('01J', 'message.created', { chatId: 'c1', id: 'm1', role: 'user', text: 'a', createdAt: 't' }),
      envelope('02J', 'message.created', { chatId: 'c2', id: 'm2', role: 'user', text: 'b', createdAt: 't' }),
      envelope('03J', 'message.delta', { chatId: 'c1', messageId: 'm1', delta: 'X' }),
    ];
    const state = foldEvents(events);
    expect(state.messagesByChat['c1']).toHaveLength(1);
    expect(state.messagesByChat['c2']).toHaveLength(1);
    expect(state.messagesByChat['c1'][0].text).toBe('a');
    expect(state.messagesByChat['c2'][0].text).toBe('b');
  });
});
