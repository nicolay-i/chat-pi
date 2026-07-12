import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { findTraceEvent } from '../TraceEventDetail';

const event = (id: string, type: string, payload: unknown): RealtimeEnvelope => ({
  id,
  sequence: 1,
  stream: 'chat',
  streamId: 'chat-1',
  createdAt: '2026-07-11T10:00:00.000Z',
  type,
  payload,
});

describe('findTraceEvent', () => {
  it('finds message and tool-call deep links by their payload identifiers', () => {
    const events = [
      event('event-message', 'message.created', { id: 'message-1', text: 'hello' }),
      event('event-tool', 'tool.started', { toolCallId: 'tool-1', name: 'git' }),
    ];

    expect(findTraceEvent(events, 'message-1', 'message')?.id).toBe('event-message');
    expect(findTraceEvent(events, 'tool-1', 'toolCall')?.id).toBe('event-tool');
    expect(findTraceEvent(events, 'missing', 'toolCall')).toBeUndefined();
  });
});
