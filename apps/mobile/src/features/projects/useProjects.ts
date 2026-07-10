import { useCallback, useEffect, useState } from 'react';
import type { Project } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';

export type ProjectsStatus = 'loading' | 'loaded' | 'empty' | 'error';

export type UseProjectsResult = {
  data: Project[] | null;
  status: ProjectsStatus;
  error: string | null;
  refetch: () => void;
};

export function useProjects(): UseProjectsResult {
  const { baseUrl } = useBackend();
  const [data, setData] = useState<Project[] | null>(null);
  const [status, setStatus] = useState<ProjectsStatus>('loading');
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
      .getProjects()
      .then((projects) => {
        if (!active) return;
        setData(projects);
        setStatus(projects.length === 0 ? 'empty' : 'loaded');
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
  }, [baseUrl, nonce]);

  return { data, status, error, refetch };
}
