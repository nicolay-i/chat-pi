import { useCallback, useEffect, useState } from 'react';
import type { Checkpoint } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';

export type CheckpointsStatus = 'loading' | 'loaded' | 'empty' | 'error';

export type UseCheckpointsResult = {
  data: Checkpoint[] | null;
  status: CheckpointsStatus;
  error: string | null;
  refetch: () => void;
};

export function useCheckpoints(taskId: string): UseCheckpointsResult {
  const { baseUrl } = useBackend();
  const [data, setData] = useState<Checkpoint[] | null>(null);
  const [status, setStatus] = useState<CheckpointsStatus>('loading');
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
      .getCheckpoints(taskId)
      .then((list) => {
        if (!active) return;
        setData(list);
        setStatus(list.length === 0 ? 'empty' : 'loaded');
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
  }, [baseUrl, taskId, nonce]);

  return { data, status, error, refetch };
}
