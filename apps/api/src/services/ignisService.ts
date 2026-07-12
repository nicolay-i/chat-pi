import type { IgnisAccess } from '@pi-agents/contracts';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';
import type { TasksRepository } from '../db/repositories/tasksRepository';

const ACTIVE_STATUSES = new Set(['created', 'creating_worktree', 'idle', 'queued', 'running', 'aborting', 'paused_clean', 'paused_dirty', 'paused_after_restart']);

export type IgnisService = {
  getAccess(projectId: string): IgnisAccess | undefined;
};

export function createIgnisService(deps: { projects: ProjectsRepository; tasks: TasksRepository }): IgnisService {
  return {
    getAccess(projectId) {
      const project = deps.projects.getById(projectId);
      if (!project) return undefined;
      return {
        url: project.ignisUrl,
        activeTaskCount: deps.tasks.listByProject(projectId).filter((task) => ACTIVE_STATUSES.has(task.status)).length,
      };
    },
  };
}
