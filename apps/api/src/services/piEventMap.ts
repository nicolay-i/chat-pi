import { randomUUID } from 'node:crypto';
import type { RealtimeEventDraft } from '../realtime/eventStore';

export interface EventMapContext {
  sessionId: string;
  projectId?: string;
  chatId?: string;
  taskId?: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Pull the first `text` part out of a message content array. */
function firstText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  for (const part of content) {
    if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') {
      return part.text;
    }
  }
  return '';
}

function withRawPiEvent(event: Record<string, unknown>, payload: Record<string, unknown>): Record<string, unknown> {
  return { ...payload, rawPiEvent: event };
}

/**
 * Map a raw pi rpc event into an event draft, or return null when the event
 * is unrecognized or the payload is malformed. Never throws — all access is
 * narrowed defensively.
 *
 * Choice for `message_update` text_end: we emit `message.delta` carrying the
 * full `content` chunk (not skipped). Clients accumulate deltas, and since the
 * text_delta already carried the same bytes this is idempotent — we prefer the
 * extra data over silently dropping a content chunk the client may rely on.
 */
export function mapPiEventToEnvelope(
  event: unknown,
  ctx: EventMapContext,
): RealtimeEventDraft | null {
  if (!isRecord(event)) return null;
  const type = asString(event.type);
  if (!type) return null;

  const createdAt =
    typeof event.timestamp === 'number'
      ? new Date(event.timestamp).toISOString()
      : new Date().toISOString();

  const streamId = ctx.taskId ?? ctx.chatId ?? ctx.sessionId;
  const stream = ctx.taskId ? 'task' : 'chat';
  const base = { id: randomUUID(), stream, streamId, createdAt } as const;

  switch (type) {
    case 'agent_start':
      return { ...base, type: 'run.started', payload: withRawPiEvent(event, {}) };

    case 'message_start': {
      const message = event.message;
      if (!isRecord(message)) return null;
      const role = asString(message.role);
      const text = firstText(message.content);
      if (role === 'user') {
        return { ...base, type: 'message.created', payload: withRawPiEvent(event, { role: 'user', text }) };
      }
      if (role === 'assistant') {
        return { ...base, type: 'message.created', payload: withRawPiEvent(event, { role: 'assistant', text: '' }) };
      }
      return null;
    }

    case 'message_update': {
      const ame = event.assistantMessageEvent;
      if (!isRecord(ame)) return null;
      const subType = asString(ame.type);
      if (subType === 'text_delta') {
        return { ...base, type: 'message.delta', payload: withRawPiEvent(event, { delta: asString(ame.delta) ?? '' }) };
      }
      if (subType === 'text_end') {
        return { ...base, type: 'message.delta', payload: withRawPiEvent(event, { delta: asString(ame.content) ?? '' }) };
      }
      return null;
    }

    case 'message_end': {
      const message = event.message;
      if (!isRecord(message)) return null;
      const role = asString(message.role) ?? 'assistant';
      const text = firstText(message.content);
      return { ...base, type: 'message.completed', payload: withRawPiEvent(event, { role, text }) };
    }

    case 'turn_end': {
      const message = event.message;
      const text = isRecord(message) ? firstText(message.content) : '';
      return { ...base, type: 'message.completed', payload: withRawPiEvent(event, { role: 'assistant', text }) };
    }

    case 'agent_end':
      return { ...base, type: 'run.completed', payload: withRawPiEvent(event, {}) };

    case 'tool_call':
      return {
        ...base,
        type: 'tool.started',
        payload: withRawPiEvent(event, { tool: asString(event.tool) ?? '', args: event.args ?? {} }),
      };

    case 'tool_result':
      return {
        ...base,
        type: 'tool.completed',
        payload: withRawPiEvent(event, {
          tool: asString(event.tool) ?? '',
          output: event.output,
          status: asString(event.status) ?? 'completed',
        }),
      };

    default:
      return null;
  }
}
