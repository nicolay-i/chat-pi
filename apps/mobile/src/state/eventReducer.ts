import type { RealtimeEnvelope, SendMessageInput } from '@pi-agents/contracts';

export type MessageView = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  complete?: boolean;
  behavior?: SendMessageInput['behavior'];
  status?: 'sending' | 'failed';
  error?: string;
};

export type ToolCallView = {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  output?: string;
};

export type EventReducerState = {
  events: RealtimeEnvelope[];
  lastSequenceByStream: Record<string, number>;
  seenEventIds: Record<string, true>;
  messagesByChat: Record<string, MessageView[]>;
  taskStatuses: Record<string, string>;
  runsByChat: Record<string, 'running' | 'completed' | 'aborted' | 'failed'>;
  queueByChat: Record<string, number>;
  toolCallsByChat: Record<string, ToolCallView[]>;
};

export const initialEventReducerState: EventReducerState = {
  events: [],
  lastSequenceByStream: {},
  seenEventIds: {},
  messagesByChat: {},
  taskStatuses: {},
  runsByChat: {},
  queueByChat: {},
  toolCallsByChat: {},
};

function shouldIgnoreEvent(state: EventReducerState, event: RealtimeEnvelope): boolean {
  if (state.seenEventIds[event.id]) return true;
  const lastSequence = state.lastSequenceByStream[`${event.stream}:${event.streamId}`];
  return lastSequence !== undefined && event.sequence <= lastSequence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function eventChatId(event: RealtimeEnvelope, payload: Record<string, unknown>): string | undefined {
  const payloadChatId = asString(payload.chatId);
  if (payloadChatId) return payloadChatId;
  return event.stream === 'chat' ? event.streamId : undefined;
}

function eventTaskId(event: RealtimeEnvelope, payload: Record<string, unknown>): string | undefined {
  const payloadTaskId = asString(payload.taskId);
  if (payloadTaskId) return payloadTaskId;
  return event.stream === 'task' ? event.streamId : undefined;
}

function queuePending(payload: Record<string, unknown>, previous: number): number {
  const pending = payload.pending;
  return typeof pending === 'number' && Number.isInteger(pending) && pending >= 0
    ? pending
    : previous + 1;
}

export function eventReducer(
  state: EventReducerState,
  event: RealtimeEnvelope,
): EventReducerState {
  if (shouldIgnoreEvent(state, event)) {
    return state;
  }

  const events = [...state.events, event];
  const next: EventReducerState = {
    ...state,
    events,
    lastSequenceByStream: {
      ...state.lastSequenceByStream,
      [`${event.stream}:${event.streamId}`]: event.sequence,
    },
    seenEventIds: { ...state.seenEventIds, [event.id]: true },
  };

  const payload = event.payload;
  if (!isRecord(payload)) {
    return next;
  }

  switch (event.type) {
    case 'message.created': {
      const chatId = eventChatId(event, payload);
      const id = asString(payload.id) ?? asString(payload.messageId);
      const role = asString(payload.role);
      const text = asString(payload.text);
      const createdAt = asString(payload.createdAt) ?? event.createdAt;
      if (!chatId || !id || !role || text === undefined || !createdAt) {
        return next;
      }
      if (role !== 'user' && role !== 'assistant' && role !== 'system') {
        return next;
      }
      const view: MessageView = { id, role, text, createdAt };
      const list = state.messagesByChat[chatId] ?? [];
      next.messagesByChat = {
        ...state.messagesByChat,
        [chatId]: [...list, view],
      };
      return next;
    }

    case 'message.delta': {
      const chatId = eventChatId(event, payload);
      const messageId = asString(payload.messageId);
      const delta = asString(payload.delta);
      if (!chatId || !messageId || delta === undefined) {
        return next;
      }
      const list = state.messagesByChat[chatId];
      if (!Array.isArray(list)) {
        return next;
      }
      const idx = [...list].reverse().findIndex((m) => m.id === messageId && m.role === 'assistant');
      if (idx === -1) {
        return next;
      }
      const realIdx = list.length - 1 - idx;
      const target = list[realIdx];
      const updated: MessageView = { ...target, text: target.text + delta };
      const newList = list.slice();
      newList[realIdx] = updated;
      next.messagesByChat = {
        ...state.messagesByChat,
        [chatId]: newList,
      };
      return next;
    }

    case 'message.completed': {
      const chatId = eventChatId(event, payload);
      const messageId = asString(payload.messageId);
      if (!chatId || !messageId) {
        return next;
      }
      const list = state.messagesByChat[chatId];
      if (!Array.isArray(list)) {
        return next;
      }
      const realIdx = list.findIndex((m) => m.id === messageId);
      if (realIdx === -1) {
        return next;
      }
      const target = list[realIdx];
      const updated: MessageView = { ...target, complete: true };
      const newList = list.slice();
      newList[realIdx] = updated;
      next.messagesByChat = {
        ...state.messagesByChat,
        [chatId]: newList,
      };
      return next;
    }

    case 'task.status.changed': {
      const taskId = eventTaskId(event, payload);
      const status = asString(payload.status);
      if (!taskId || !status) {
        return next;
      }
      next.taskStatuses = { ...state.taskStatuses, [taskId]: status };
      return next;
    }

    case 'run.started': {
      const chatId = eventChatId(event, payload);
      if (!chatId) return next;
      next.runsByChat = { ...state.runsByChat, [chatId]: 'running' };
      next.queueByChat = { ...state.queueByChat, [chatId]: 0 };
      return next;
    }

    case 'run.completed': {
      const chatId = eventChatId(event, payload);
      if (!chatId) return next;
      next.runsByChat = { ...state.runsByChat, [chatId]: 'completed' };
      next.queueByChat = { ...state.queueByChat, [chatId]: 0 };
      return next;
    }

    case 'run.aborted': {
      const chatId = eventChatId(event, payload);
      if (!chatId) return next;
      next.runsByChat = { ...state.runsByChat, [chatId]: 'aborted' };
      next.queueByChat = { ...state.queueByChat, [chatId]: 0 };
      return next;
    }

    case 'run.error': {
      const chatId = eventChatId(event, payload);
      if (!chatId) return next;
      next.runsByChat = { ...state.runsByChat, [chatId]: 'failed' };
      return next;
    }

    case 'queue.updated': {
      const chatId = eventChatId(event, payload);
      if (!chatId) return next;
      next.queueByChat = {
        ...state.queueByChat,
        [chatId]: queuePending(payload, state.queueByChat[chatId] ?? 0),
      };
      return next;
    }

    case 'tool.started': {
      const chatId = eventChatId(event, payload);
      if (!chatId) return next;
      const name = asString(payload.tool) ?? asString(payload.name) ?? 'tool';
      const call: ToolCallView = { id: event.id, name, status: 'running' };
      next.toolCallsByChat = {
        ...state.toolCallsByChat,
        [chatId]: [...(state.toolCallsByChat[chatId] ?? []), call],
      };
      return next;
    }

    case 'tool.completed':
    case 'tool.output': {
      const chatId = eventChatId(event, payload);
      if (!chatId) return next;
      const name = asString(payload.tool) ?? asString(payload.name);
      const calls = state.toolCallsByChat[chatId] ?? [];
      const index = [...calls].reverse().findIndex((call) => call.status === 'running' && (!name || call.name === name));
      if (index === -1) return next;
      const targetIndex = calls.length - 1 - index;
      const output = asString(payload.output);
      const updated = calls.slice();
      updated[targetIndex] = {
        ...updated[targetIndex],
        status: event.type === 'tool.completed' ? 'completed' : 'running',
        output: output ?? updated[targetIndex].output,
      };
      next.toolCallsByChat = { ...state.toolCallsByChat, [chatId]: updated };
      return next;
    }

    default:
      return next;
  }
}

export function foldEvents(events: RealtimeEnvelope[]): EventReducerState {
  return events.reduce(eventReducer, initialEventReducerState);
}
