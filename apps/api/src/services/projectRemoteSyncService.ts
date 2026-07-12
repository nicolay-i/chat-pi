import type { ProjectRemoteSync } from '@pi-agents/contracts';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';
import type { TasksRepository } from '../db/repositories/tasksRepository';
import type { EventStore } from '../realtime/eventStore';
import { runGit, type RunGit } from './gitExec';
import { isValidStatusTransition } from './taskStatus';
import { InMemoryProjectOperationMutex, type ProjectOperationMutex } from './projectOperationMutex';

export type ProjectRemoteSyncMode = 'inspect' | 'apply';

export type ProjectRemoteSyncService = {
  sync(projectId: string, mode: ProjectRemoteSyncMode): Promise<ProjectRemoteSync>;
};

export function createProjectRemoteSyncService(
  deps: {
    projects: ProjectsRepository;
    tasks: TasksRepository;
    events: EventStore;
    operations?: ProjectOperationMutex;
  },
  git: RunGit = runGit,
): ProjectRemoteSyncService {
  const operations = deps.operations ?? new InMemoryProjectOperationMutex();
  return {
    async sync(projectId, mode) {
      const requested = deps.projects.getById(projectId);
      if (!requested) throw new Error(`project not found: ${projectId}`);
      return operations.run(projectId, async () => {
        const project = deps.projects.getById(projectId);
        if (!project) throw new Error(`project not found: ${projectId}`);
        const dirty = git(['status', '--porcelain'], { cwd: project.repoPath }).stdout;
        if (dirty) throw new Error('primary repository has uncommitted changes');
        git(['fetch', '--prune', 'origin'], { cwd: project.repoPath });
        const targetRef = `origin/${project.defaultBranch}`;
        const localSha = git(['rev-parse', project.defaultBranch], { cwd: project.repoPath }).stdout;
        const remoteSha = git(['rev-parse', '--verify', targetRef], { cwd: project.repoPath }).stdout;
        let status: ProjectRemoteSync['status'];
        if (localSha === remoteSha) {
          status = 'up_to_date';
        } else {
          let localIsAncestor = false;
          let remoteIsAncestor = false;
          try { git(['merge-base', '--is-ancestor', localSha, remoteSha], { cwd: project.repoPath }); localIsAncestor = true; } catch { /* not an ancestor */ }
          try { git(['merge-base', '--is-ancestor', remoteSha, localSha], { cwd: project.repoPath }); remoteIsAncestor = true; } catch { /* not an ancestor */ }
          if (localIsAncestor) status = 'fast_forward_available';
          else if (remoteIsAncestor) status = 'local_ahead';
          else status = 'diverged';
        }
        if (mode === 'apply') {
          if (status !== 'fast_forward_available') {
            throw new Error(`fast-forward is unavailable: ${status}`);
          }
          git(['merge', '--ff-only', targetRef], { cwd: project.repoPath });
          status = 'fast_forward_applied';
        }

        const currentTargetSha = status === 'fast_forward_applied'
          ? git(['rev-parse', project.defaultBranch], { cwd: project.repoPath }).stdout
          : localSha;
        const staleTaskIds: string[] = [];
        if (status === 'fast_forward_applied') {
          for (const task of deps.tasks.listByProject(projectId)) {
            if (task.baseSha === currentTargetSha || !isValidStatusTransition(task.status, 'stale')) continue;
            deps.tasks.updateStatus(task.id, 'stale');
            staleTaskIds.push(task.id);
            await deps.events.append({
              stream: 'task', streamId: task.id, projectId, chatId: task.sourceChatId ?? undefined, taskId: task.id,
              type: 'task.status.changed', payload: { taskId: task.id, status: 'stale', reason: 'remote_target_advanced' },
            });
          }
        }
        return {
          projectId,
          status,
          localSha: currentTargetSha,
          remoteSha,
          targetRef,
          staleTaskIds,
        };
      });
    },
  };
}
