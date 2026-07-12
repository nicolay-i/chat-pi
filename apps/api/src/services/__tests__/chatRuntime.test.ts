import { describe, expect, it } from 'vitest';
import type { EventType } from '@pi-agents/contracts';
import { FakeChatRuntime, PiChatRuntime } from '../chatRuntime';

describe('FakeChatRuntime', () => {
  it('emits a chat-shaped assistant response', async () => {
    const events: Array<{ type: EventType; payload: unknown }> = [];
    const runtime = new FakeChatRuntime();

    await runtime.send(
      'chat-1',
      { text: 'Проверь поток', behavior: 'send' },
      (type, payload) => events.push({ type, payload }),
    );

    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'message.created',
      'message.delta',
      'message.completed',
      'run.completed',
    ]);
    expect(events[1]?.payload).toMatchObject({
      chatId: 'chat-1',
      role: 'assistant',
      text: '',
    });
    expect(events[2]?.payload).toMatchObject({
      chatId: 'chat-1',
      delta: 'Принял задачу: Проверь поток',
    });
  });
});

describe('PiChatRuntime', () => {
  it('disposes without a started Pi session', async () => {
    await expect(new PiChatRuntime().dispose()).resolves.toBeUndefined();
  });
});
