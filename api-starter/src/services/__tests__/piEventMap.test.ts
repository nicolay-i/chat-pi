import { describe, it, expect } from 'vitest';
import { mapPiEventToEnvelope } from '../piEventMap';

const ctx = { sessionId: 'sess-1', taskId: 'task-9' };

describe('mapPiEventToEnvelope', () => {
  it('maps agent_start -> run.started', () => {
    const env = mapPiEventToEnvelope({ type: 'agent_start' }, ctx);
    expect(env).not.toBeNull();
    expect(env?.type).toBe('run.started');
    expect(env?.stream).toBe('task');
    expect(env?.streamId).toBe('task-9');
    expect(env?.id).toBeTruthy();
    expect(env?.createdAt).toBeTruthy();
  });

  it('uses a top-level numeric timestamp when present', () => {
    const env = mapPiEventToEnvelope({ type: 'agent_start', timestamp: 1783348290000 }, ctx);
    expect(env?.createdAt).toBe(new Date(1783348290000).toISOString());
  });

  it('maps message_start user -> message.created role user with text', () => {
    const env = mapPiEventToEnvelope(
      {
        type: 'message_start',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'reply with exactly: ok' }],
          timestamp: 1783348290000,
        },
      },
      ctx,
    );
    expect(env?.type).toBe('message.created');
    expect(env?.payload).toEqual({ role: 'user', text: 'reply with exactly: ok' });
    expect(env?.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it('maps message_start assistant -> message.created role assistant empty text', () => {
    const env = mapPiEventToEnvelope(
      {
        type: 'message_start',
        message: { role: 'assistant', content: [], timestamp: 1783348291529 },
      },
      ctx,
    );
    expect(env?.type).toBe('message.created');
    expect(env?.payload).toEqual({ role: 'assistant', text: '' });
  });

  it('maps message_update text_delta -> message.delta with the delta', () => {
    const env = mapPiEventToEnvelope(
      {
        type: 'message_update',
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'ok' },
        message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      },
      ctx,
    );
    expect(env?.type).toBe('message.delta');
    expect(env?.payload).toEqual({ delta: 'ok' });
  });

  it('maps message_update text_end -> message.delta with full content chunk', () => {
    const env = mapPiEventToEnvelope(
      {
        type: 'message_update',
        assistantMessageEvent: { type: 'text_end', contentIndex: 0, content: 'ok' },
        message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      },
      ctx,
    );
    expect(env?.type).toBe('message.delta');
    expect(env?.payload).toEqual({ delta: 'ok' });
  });

  it('maps message_end -> message.completed', () => {
    const env = mapPiEventToEnvelope(
      {
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      },
      ctx,
    );
    expect(env?.type).toBe('message.completed');
    expect(env?.payload).toEqual({ role: 'assistant', text: 'ok' });
  });

  it('maps turn_end -> message.completed role assistant', () => {
    const env = mapPiEventToEnvelope(
      {
        type: 'turn_end',
        message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
        toolResults: [],
      },
      ctx,
    );
    expect(env?.type).toBe('message.completed');
    expect(env?.payload).toEqual({ role: 'assistant', text: 'ok' });
  });

  it('maps agent_end -> run.completed', () => {
    const env = mapPiEventToEnvelope(
      { type: 'agent_end', messages: [], willRetry: false },
      ctx,
    );
    expect(env?.type).toBe('run.completed');
    expect(env?.payload).toEqual({});
  });

  it('returns null for an unknown event type', () => {
    expect(mapPiEventToEnvelope({ type: 'extension_ui_request', id: 'x' }, ctx)).toBeNull();
    expect(mapPiEventToEnvelope({ type: 'turn_start' }, ctx)).toBeNull();
  });

  it('returns null for a malformed payload (no throw)', () => {
    expect(mapPiEventToEnvelope({ type: 'message_start' }, ctx)).toBeNull();
    expect(mapPiEventToEnvelope({ type: 'message_start', message: 'nope' }, ctx)).toBeNull();
    expect(mapPiEventToEnvelope({ type: 'message_update' }, ctx)).toBeNull();
    expect(mapPiEventToEnvelope({ type: 'message_end', message: null }, ctx)).toBeNull();
    expect(mapPiEventToEnvelope(null, ctx)).toBeNull();
    expect(mapPiEventToEnvelope('not-an-object', ctx)).toBeNull();
    expect(mapPiEventToEnvelope({}, ctx)).toBeNull();
  });

  it('uses chat stream when no taskId is provided', () => {
    const env = mapPiEventToEnvelope({ type: 'agent_start' }, {
      sessionId: 'sess-1',
      chatId: 'chat-2',
    });
    expect(env?.stream).toBe('chat');
    expect(env?.streamId).toBe('chat-2');
  });
});
