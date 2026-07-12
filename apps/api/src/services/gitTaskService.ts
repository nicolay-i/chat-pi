import type { DiffEntry, DiffFileContent, TaskStatus } from '@pi-agents/contracts';
import type { TasksRepository } from '../db/repositories/tasksRepository';
import type { EventStore } from '../realtime/eventStore';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runGit, type RunGit } from './gitExec';
import { InMemoryProjectOperationMutex, type ProjectOperationMutex } from './projectOperationMutex';

export type GitTaskService = {
  listDiff(taskId: string): Promise<DiffEntry[]>;
  listDiffSince(taskId: string, baseSha: string): Promise<DiffEntry[]>;
  getDiffFile(taskId: string, path: string): Promise<DiffFileContent>;
  revertFile(taskId: string, path: string): Promise<void>;
  fetch(taskId: string): Promise<void>;
  rebase(taskId: string): Promise<void>;
  push(taskId: string): Promise<void>;
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

function countTextLines(path: string): number {
  const content = readFileSync(path);
  if (content.includes(0)) return 0;
  const text = content.toString('utf8');
  if (!text) return 0;
  return (text.match(/\n/g)?.length ?? 0) + (text.endsWith('\n') ? 0 : 1);
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
    const tracked = names.split('\n').filter(Boolean).map((line) => {
      const [kind, firstPath, secondPath] = line.split('\t');
      const path = secondPath ?? firstPath;
      const stat = stats.get(path) ?? { additions: 0, deletions: 0 };
      return { path, status: statusFromName(kind ?? ''), ...stat };
    });
    const seen = new Set(tracked.map((entry) => entry.path));
    const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'], { cwd: task.worktreePath }).stdout
      .split('\0')
      .filter(Boolean)
      .filter((path) => !seen.has(path))
      .map((path) => ({
        path,
        status: 'added' as const,
        additions: countTextLines(join(task.worktreePath, path)),
        deletions: 0,
      }));
    return [...tracked, ...untracked];
  };
  const isUntracked = (task: ReturnType<typeof taskFor>, path: string): boolean =>
    git(['ls-files', '--others', '--exclude-standard', '-z', '--', path], { cwd: task.worktreePath }).stdout
      .split('\0')
      .includes(path);
  const assertRemoteSafe = (status: TaskStatus, action: string): void => {
    if (['queued', 'running', 'aborting', 'merge_running', 'merged', 'archived', 'cancelled_archived', 'cancelled_discarded'].includes(status)) {
      throw new Error(`${action} disabled for task status '${status}'`);
    }
  };
  const remoteTarget = (taskId: string): string => {
    const task = taskFor(taskId);
    const ref = `refs/remotes/origin/${task.mergeTarget}`;
    try {
      git(['rev-parse', '--verify', ref], { cwd: task.worktreePath });
      return `origin/${task.mergeTarget}`;
    } catch {
      return task.mergeTarget;
    }
  };
  return {
    async listDiff(taskId) {
      return listDiffFrom(taskId, taskFor(taskId).baseSha);
    },
    async listDiffSince(taskId, baseSha) {
      return listDiffFrom(taskId, baseSha);
    },
    async getDiffFile(taskId, path) {
      assertSafeRepoPath(path);
      const task = taskFor(taskId);
      if (isUntracked(task, path)) {
        const filePath = join(task.worktreePath, path);
        if (!existsSync(filePath)) throw new Error(`untracked path does not exist: ${path}`);
        return { path, hunks: [{ header: `new file: ${path}`, lines: readFileSync(filePath, 'utf8').split('\n') }] };
      }
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
      if (isUntracked(task, path)) {
        git(['clean', '-f', '--', path], { cwd: task.worktreePath });
      } else if (!changeType) {
        throw new Error(`path is not changed in task: ${path}`);
      } else if (changeType.startsWith('A')) {
        git(['rm', '-f', '--ignore-unmatch', '--', path], { cwd: task.worktreePath });
      } else {
        git(['checkout', task.baseSha, '--', path], { cwd: task.worktreePath });
      }
      const remaining = listDiffFrom(taskId, task.baseSha).length;
      await deps.events.append({
        stream: 'task', streamId: taskId, type: 'diff.updated', payload: { taskId, changedFiles: remaining, revertedPath: path },
      });
    },
    async fetch(taskId) {
      const requestedTask = taskFor(taskId);
      await operations.run(requestedTask.projectId, async () => {
        const task = taskFor(taskId);
        assertRemoteSafe(task.status, 'fetch');
        git(['fetch', '--prune', 'origin'], { cwd: task.worktreePath });
        const target = remoteTarget(taskId);
        const behind = Number.parseInt(git(['rev-list', '--count', `${task.baseSha}..${target}`], { cwd: task.worktreePath }).stdout, 10) || 0;
        if (behind > 0 && (task.status === 'idle' || task.status === 'needs_review')) {
          deps.tasks.updateStatus(task.id, 'stale');
          await deps.events.append({
            stream: 'task', streamId: task.id, type: 'task.status.changed',
            payload: { taskId: task.id, status: 'stale', remoteTarget: target, behind },
          });
        }
      });
    },
    async rebase(taskId) {
      const requestedTask = taskFor(taskId);
      await operations.run(requestedTask.projectId, async () => {
        const task = taskFor(taskId);
        if (task.status !== 'stale') throw new Error(`rebase disabled for task status '${task.status}'`);
        try {
          const target = remoteTarget(taskId);
          git(['rebase', target], { cwd: task.worktreePath });
          const head = git(['rev-parse', 'HEAD'], { cwd: task.worktreePath }).stdout;
          const baseSha = git(['rev-parse', target], { cwd: task.worktreePath }).stdout;
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
    async push(taskId) {
      const requestedTask = taskFor(taskId);
      await operations.run(requestedTask.projectId, async () => {
        const task = taskFor(taskId);
        assertRemoteSafe(task.status, 'push');
        git(['push', '--set-upstream', 'origin', task.branchName], { cwd: task.worktreePath });
        await deps.events.append({
          stream: 'task', streamId: task.id, type: 'task.status.changed',
          payload: { taskId: task.id, pushed: true, remote: 'origin', branch: task.branchName },
        });
      });
    },
  };
}
