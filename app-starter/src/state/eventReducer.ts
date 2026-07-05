import type { RealtimeEnvelope } from '@pi-agents/contracts';

export type MessageView = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  complete?: boolean;
};

export type EventReducerState = {
  events: RealtimeEnvelope[];
  lastEventId: string | null;
  messagesByChat: Record<string, MessageView[]>;
  taskStatuses: Record<string, string>;
};

export const initialEventReducerState: EventReducerState = {
  events: [],
  lastEventId: null,
  messagesByChat: {},
  taskStatuses: {},
};

// Assumes monotonic ULID-like ids: lexicographic string comparison reflects order.
// Duplicates (event.id <= lastEventId) are dropped to keep the fold idempotent.
function isStale(eventId: string | undefined, lastEventId: string | null): boolean {
  if (!eventId) return true;
  return lastEventId !== null && eventId <= lastEventId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function eventReducer(
  state: EventReducerState,
  event: RealtimeEnvelope,
): EventReducerState {
  if (isStale(event.id, state.lastEventId)) {
    return state;
  }

  const events = [...state.events, event];
  const next: EventReducerState = {
    ...state,
    events,
    lastEventId: event.id,
  };

  const payload = event.payload;
  if (!isRecord(payload)) {
    return next;
  }

  switch (event.type) {
    case 'message.created': {
      const chatId = asString(payload.chatId);
      const id = asString(payload.id);
      const role = asString(payload.role);
      const text = asString(payload.text);
      const createdAt = asString(payload.createdAt);
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
      const chatId = asString(payload.chatId);
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
      const chatId = asString(payload.chatId);
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
      const taskId = asString(payload.taskId);
      const status = asString(payload.status);
      if (!taskId || !status) {
        return next;
      }
      next.taskStatuses = { ...state.taskStatuses, [taskId]: status };
      return next;
    }

    default:
      return next;
  }
}

export function foldEvents(events: RealtimeEnvelope[]): EventReducerState {
  return events.reduce(eventReducer, initialEventReducerState);
}
