import { useCallback, useEffect, useState } from 'react';
import type { Chat } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/stores/useBackend';

export type ChatsStatus = 'loading' | 'loaded' | 'empty' | 'error';

export type UseChatsResult = {
  data: Chat[] | null;
  status: ChatsStatus;
  error: string | null;
  refetch: () => void;
};

export function useChats(projectId: string): UseChatsResult {
  const { baseUrl } = useBackend();
  const [data, setData] = useState<Chat[] | null>(null);
  const [status, setStatus] = useState<ChatsStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl) {
      setStatus('error');
      setError('Backend URL is not configured');
      setData(null);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getChats(projectId)
      .then((chats) => {
        if (!active) return;
        setData(chats);
        setStatus(chats.length === 0 ? 'empty' : 'loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setData(null);
        setError(message);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, projectId, nonce]);

  return { data, status, error, refetch };
}
