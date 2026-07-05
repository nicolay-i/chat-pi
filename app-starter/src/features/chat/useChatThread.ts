import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskStatus } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import type { SendMessageBehavior } from '@/components/chat/composerRules';
import { useBackend } from '@/state/backendStore';
import {
  type ConnectionStatus,
  selectIsOffline,
  useConnection,
} from '@/state/connectionStore';
import {
  type EventReducerState,
  eventReducer,
  initialEventReducerState,
  type MessageView,
} from '@/state/eventReducer';
import { createRealtimeClient } from '@/state/realtimeClient';

export type UseChatThreadResult = {
  messages: MessageView[];
  connectionStatus: ConnectionStatus;
  isOffline: boolean;
  sending: boolean;
  activeTaskId: string | null;
  taskStatus: TaskStatus | null;
  send: (text: string, behavior?: SendMessageBehavior) => Promise<void>;
};

export function useChatThread(chatId: string): UseChatThreadResult {
  const { baseUrl } = useBackend();
  const { status } = useConnection();

  const [state, setState] = useState<EventReducerState>(initialEventReducerState);
  const [sending, setSending] = useState(false);
  const clientRef = useRef<ReturnType<typeof createRealtimeClient> | null>(null);

  useEffect(() => {
    if (!baseUrl) return;
    const client = createRealtimeClient({
      baseUrl,
      chatId,
      onEvent: (event) => {
        setState((prev) => eventReducer(prev, event));
      },
    });
    clientRef.current = client;
    client.start();
    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [baseUrl, chatId]);

  const messages = useMemo<MessageView[]>(
    () => state.messagesByChat[chatId] ?? [],
    [state.messagesByChat, chatId],
  );

  const activeTaskId = useMemo<string | null>(() => {
    const ids = Object.keys(state.taskStatuses);
    return ids.length > 0 ? ids[ids.length - 1] : null;
  }, [state.taskStatuses]);

  const taskStatus = useMemo<TaskStatus | null>(() => {
    if (!activeTaskId) return null;
    const raw = state.taskStatuses[activeTaskId];
    return (raw as TaskStatus | undefined) ?? null;
  }, [state.taskStatuses, activeTaskId]);

  const send = async (text: string, behavior: SendMessageBehavior = 'send') => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!baseUrl) {
      throw new Error('Backend URL is not configured');
    }
    const client = new ApiClient(baseUrl);
    setSending(true);
    try {
      await client.sendMessage(chatId, { text: trimmed, behavior });
    } finally {
      setSending(false);
    }
  };

  return {
    messages,
    connectionStatus: status,
    isOffline: selectIsOffline(status),
    sending,
    activeTaskId,
    taskStatus,
    send,
  };
}
