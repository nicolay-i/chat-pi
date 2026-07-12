import { useCallback, useEffect, useState } from 'react';
import type { DiffEntry, DiffFileContent } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/stores/useBackend';

export type DiffEntriesStatus = 'loading' | 'loaded' | 'empty' | 'error';
export type DiffFileStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type UseTaskDiffResult = {
  entries: DiffEntry[] | null;
  status: DiffEntriesStatus;
  error: string | null;
  refetch: () => void;
  selectedPath: string | null;
  selectPath: (path: string) => void;
  fileContent: DiffFileContent | null;
  fileStatus: DiffFileStatus;
  fileError: string | null;
};

export function useTaskDiff(taskId: string): UseTaskDiffResult {
  const { baseUrl } = useBackend();
  const [entries, setEntries] = useState<DiffEntry[] | null>(null);
  const [status, setStatus] = useState<DiffEntriesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<DiffFileContent | null>(null);
  const [fileStatus, setFileStatus] = useState<DiffFileStatus>('idle');
  const [fileError, setFileError] = useState<string | null>(null);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  const selectPath = useCallback((path: string) => setSelectedPath(path), []);

  useEffect(() => {
    if (!baseUrl) {
      setStatus('error');
      setError('Backend URL is not configured');
      setEntries(null);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getTaskDiff(taskId)
      .then((list) => {
        if (!active) return;
        setEntries(list);
        setStatus(list.length === 0 ? 'empty' : 'loaded');
        if (list.length > 0) {
          const first = list[0];
          if (first) setSelectedPath(first.path);
        } else {
          setSelectedPath(null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setEntries(null);
        setError(message);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, taskId, nonce]);

  useEffect(() => {
    if (!baseUrl || !selectedPath) {
      setFileContent(null);
      setFileStatus('idle');
      setFileError(null);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setFileStatus('loading');
    setFileError(null);
    setFileContent(null);
    client
      .getTaskDiffFile(taskId, selectedPath)
      .then((content) => {
        if (!active) return;
        setFileContent(content);
        setFileStatus('loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setFileError(message);
        setFileStatus('error');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, taskId, selectedPath]);

  return {
    entries,
    status,
    error,
    refetch,
    selectedPath,
    selectPath,
    fileContent,
    fileStatus,
    fileError,
  };
}
