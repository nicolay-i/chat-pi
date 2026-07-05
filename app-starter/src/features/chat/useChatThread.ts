import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from '@/api/client';
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
  send: (text: string) => Promise<void>;
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

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!baseUrl) {
      throw new Error('Backend URL is not configured');
    }
    const client = new ApiClient(baseUrl);
    setSending(true);
    try {
      await client.sendMessage(chatId, { text: trimmed, behavior: 'send' });
    } finally {
      setSending(false);
    }
  };

  return {
    messages,
    connectionStatus: status,
    isOffline: selectIsOffline(status),
    sending,
    send,
  };
}
