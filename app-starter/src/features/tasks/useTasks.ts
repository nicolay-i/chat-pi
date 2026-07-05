import { useCallback, useEffect, useState } from 'react';
import type { Task } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';

export type TasksStatus = 'loading' | 'loaded' | 'empty' | 'error';

export type UseTasksResult = {
  data: Task[] | null;
  status: TasksStatus;
  error: string | null;
  refetch: () => void;
};

export function useTasks(projectId: string): UseTasksResult {
  const { baseUrl } = useBackend();
  const [data, setData] = useState<Task[] | null>(null);
  const [status, setStatus] = useState<TasksStatus>('loading');
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
      .getTasks(projectId)
      .then((tasks) => {
        if (!active) return;
        setData(tasks);
        setStatus(tasks.length === 0 ? 'empty' : 'loaded');
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

export type TaskDetailStatus = 'loading' | 'loaded' | 'error';

export type UseTaskResult = {
  data: Task | null;
  status: TaskDetailStatus;
  error: string | null;
  refetch: () => void;
};

export function useTask(taskId: string): UseTaskResult {
  const { baseUrl } = useBackend();
  const [data, setData] = useState<Task | null>(null);
  const [status, setStatus] = useState<TaskDetailStatus>('loading');
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
      .getTask(taskId)
      .then((task) => {
        if (!active) return;
        setData(task);
        setStatus('loaded');
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
