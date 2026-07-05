import { useCallback, useEffect, useState } from 'react';
import type { FileNode } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';

export type FilesStatus = 'loading' | 'loaded' | 'empty' | 'error';

export type UseProjectFilesResult = {
  nodes: FileNode[] | null;
  status: FilesStatus;
  error: string | null;
  refetch: () => void;
};

export function useProjectFiles(projectId: string): UseProjectFilesResult {
  const { baseUrl } = useBackend();
  const [nodes, setNodes] = useState<FileNode[] | null>(null);
  const [status, setStatus] = useState<FilesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl) {
      setStatus('error');
      setError('Backend URL is not configured');
      setNodes(null);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getProjectFiles(projectId)
      .then((list) => {
        if (!active) return;
        setNodes(list);
        setStatus(list.length === 0 ? 'empty' : 'loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setNodes(null);
        setError(message);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, projectId, nonce]);

  return { nodes, status, error, refetch };
}
