import type { DiffEntry, DiffFileContent, TaskStatus } from '@pi-agents/contracts';
import type { TasksRepository } from '../db/repositories/tasksRepository';
import type { EventStore } from '../realtime/eventStore';
import { runGit, type RunGit } from './gitExec';
import { InMemoryProjectOperationMutex, type ProjectOperationMutex } from './projectOperationMutex';

export type GitTaskService = {
  listDiff(taskId: string): Promise<DiffEntry[]>;
  listDiffSince(taskId: string, baseSha: string): Promise<DiffEntry[]>;
  getDiffFile(taskId: string, path: string): Promise<DiffFileContent>;
  revertFile(taskId: string, path: string): Promise<void>;
  rebase(taskId: string): Promise<void>;
};

function parseNumstat(output: string): Map<string, { additions: number; deletions: number }> {
  const result = new Map<string, { additions: number; deletions: number }>();
  for (const line of output.split('\n')) {
    const [added, deleted, path] = line.split('\t');
    if (!path) continue;
    result.set(path, { additions: Number(added) || 0, deletions: Number(deleted) || 0 });
  }
  return result;
}

function statusFromName(value: string): DiffEntry['status'] {
  if (value.startsWith('A')) return 'added';
  if (value.startsWith('D')) return 'deleted';
  if (value.startsWith('R')) return 'renamed';
  return 'modified';
}

function assertSafeRepoPath(path: string): void {
  if (!path || /(^|[\\/])\.\.([\\/]|$)/.test(path) || /^[\\/]/.test(path) || /^[A-Za-z]:[\\/]/.test(path)) {
    throw new Error('path must be a repository-relative file path');
  }
}

export function createGitTaskService(
  deps: { tasks: TasksRepository; events: EventStore; operations?: ProjectOperationMutex },
  git: RunGit = runGit,
): GitTaskService {
  const operations = deps.operations ?? new InMemoryProjectOperationMutex();
  const taskFor = (taskId: string) => {
    const task = deps.tasks.getById(taskId);
    if (!task) throw new Error(`task not found: ${taskId}`);
    return task;
  };
  const listDiffFrom = (taskId: string, baseSha: string): DiffEntry[] => {
    const task = taskFor(taskId);
    const stats = parseNumstat(git(['diff', '--numstat', baseSha], { cwd: task.worktreePath }).stdout);
    const names = git(['diff', '--name-status', baseSha], { cwd: task.worktreePath }).stdout;
    return names.split('\n').filter(Boolean).map((line) => {
      const [kind, firstPath, secondPath] = line.split('\t');
      const path = secondPath ?? firstPath;
      const stat = stats.get(path) ?? { additions: 0, deletions: 0 };
      return { path, status: statusFromName(kind ?? ''), ...stat };
    });
  };
  return {
    async listDiff(taskId) {
      return listDiffFrom(taskId, taskFor(taskId).baseSha);
    },
    async listDiffSince(taskId, baseSha) {
      return listDiffFrom(taskId, baseSha);
    },
    async getDiffFile(taskId, path) {
      const task = taskFor(taskId);
      const text = git(['diff', '--unified=3', task.baseSha, '--', path], { cwd: task.worktreePath }).stdout;
      return { path, hunks: text ? [{ header: `diff -- ${path}`, lines: text.split('\n') }] : [] };
    },
    async revertFile(taskId, path) {
      assertSafeRepoPath(path);
      const task = taskFor(taskId);
      if (task.status !== 'idle' && task.status !== 'needs_review' && task.status !== 'stale') {
        throw new Error(`revert disabled for task status '${task.status}'`);
      }
      const changeType = git(['diff', '--name-status', task.baseSha, '--', path], { cwd: task.worktreePath }).stdout;
      if (!changeType) throw new Error(`path is not changed in task: ${path}`);
      if (changeType.startsWith('A')) {
        git(['rm', '-f', '--ignore-unmatch', '--', path], { cwd: task.worktreePath });
      } else {
        git(['checkout', task.baseSha, '--', path], { cwd: task.worktreePath });
      }
      const remaining = listDiffFrom(taskId, task.baseSha).length;
      await deps.events.append({
        stream: 'task', streamId: taskId, type: 'diff.updated', payload: { taskId, changedFiles: remaining, revertedPath: path },
      });
    },
    async rebase(taskId) {
      const requestedTask = taskFor(taskId);
      await operations.run(requestedTask.projectId, async () => {
        const task = taskFor(taskId);
        if (task.status !== 'stale') throw new Error(`rebase disabled for task status '${task.status}'`);
        try {
          git(['rebase', task.mergeTarget], { cwd: task.worktreePath });
          const head = git(['rev-parse', 'HEAD'], { cwd: task.worktreePath }).stdout;
          const baseSha = git(['rev-parse', task.mergeTarget], { cwd: task.worktreePath }).stdout;
          deps.tasks.update(taskId, { baseSha, currentHeadSha: head });
          deps.tasks.updateStatus(taskId, 'idle' satisfies TaskStatus);
          await deps.events.append({ stream: 'task', streamId: taskId, type: 'task.status.changed', payload: { taskId, status: 'idle', rebased: true } });
        } catch (error) {
          deps.tasks.updateStatus(taskId, 'merge_conflict' satisfies TaskStatus);
          await deps.events.append({ stream: 'task', streamId: taskId, type: 'merge.conflict', payload: { taskId, error: (error as Error).message } });
          throw error;
        }
      });
    },
  };
}
