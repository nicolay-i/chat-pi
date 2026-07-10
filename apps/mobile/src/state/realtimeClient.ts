import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { RealtimeManager, type RealtimeState } from './RealtimeManager';
import { connectionActions } from './connectionStore';

export type RealtimeClientOptions = {
  baseUrl: string;
  chatId: string;
  onEvent: (event: RealtimeEnvelope) => void;
  onState?: (state: RealtimeState) => void;
  initialAfter?: string | null;
  maxReconnectAttempts?: number;
};

export type RealtimeClient = {
  start: () => void;
  stop: () => void;
  getLastEventId: () => string | null;
  getState: () => RealtimeState;
};

function streamUrl(baseUrl: string, chatId: string): string {
  const trimmed = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${trimmed}/api/chats/${encodeURIComponent(chatId)}/events`;
}

export function createRealtimeClient(options: RealtimeClientOptions): RealtimeClient {
  const url = streamUrl(options.baseUrl, options.chatId);

  const manager = new RealtimeManager({
    url,
    initialAfter: options.initialAfter ?? null,
    maxReconnectAttempts: options.maxReconnectAttempts,
    onEvent: (event) => {
      connectionActions.setLastEventId(event.id);
      options.onEvent(event);
    },
    onState: (state) => {
      connectionActions.setStatus(state);
      options.onState?.(state);
    },
  });

  return {
    start: () => manager.start(),
    stop: () => manager.stop(),
    getLastEventId: () => manager.getLastEventId(),
    getState: () => manager.getState(),
  };
}
