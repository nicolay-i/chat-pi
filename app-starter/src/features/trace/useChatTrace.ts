import { useCallback, useEffect, useState } from 'react';
import { RealtimeEnvelopeSchema, type RealtimeEnvelope } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';

export type TraceStatus = 'loading' | 'loaded' | 'empty' | 'error';

export type UseChatTraceResult = {
  data: RealtimeEnvelope[] | null;
  status: TraceStatus;
  error: string | null;
  refetch: () => void;
};

function parseEnvelopes(raw: unknown): RealtimeEnvelope[] {
  if (!Array.isArray(raw)) return [];
  const out: RealtimeEnvelope[] = [];
  for (const item of raw) {
    const parsed = RealtimeEnvelopeSchema.safeParse(item);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}

export function useChatTrace(chatId: string): UseChatTraceResult {
  const { baseUrl } = useBackend();
  const [data, setData] = useState<RealtimeEnvelope[] | null>(null);
  const [status, setStatus] = useState<TraceStatus>('loading');
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
      .getChatTrace(chatId)
      .then((raw) => {
        if (!active) return;
        const envelopes = parseEnvelopes(raw);
        setData(envelopes);
        setStatus(envelopes.length === 0 ? 'empty' : 'loaded');
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
  }, [baseUrl, chatId, nonce]);

  return { data, status, error, refetch };
}
