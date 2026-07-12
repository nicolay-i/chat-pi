import { useEffect } from 'react';
import type { Project } from '@pi-agents/contracts';
import { useRootStore } from '@/providers/RootStoreProvider';
import type { ProjectsStatus } from '@/stores/projectsStore';

export type UseProjectsResult = {
  data: Project[] | null;
  status: ProjectsStatus;
  error: string | null;
  refetch: () => void;
};

export function useProjects(): UseProjectsResult {
  const { backend, projects } = useRootStore();

  useEffect(() => {
    void projects.load();
  }, [backend.baseUrl, projects]);

  return {
    data: projects.data,
    status: projects.status,
    error: projects.error,
    refetch: () => { void projects.load(); },
  };
}
