import type { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { TasksRepository } from '../db';
import type { ChatsRepository } from '../db/repositories/chatsRepository';
import type { EventStore } from '../realtime/eventStore';
import { runGit, type RunGit } from './gitExec';
import type { GitWorktreeService } from './gitWorktreeService';
import type { TaskStatus } from '@pi-agents/contracts';
import { InMemoryProjectOperationMutex, type ProjectOperationMutex } from './projectOperationMutex';

export type MergeDeps = {
  worktree: GitWorktreeService;
  events: EventStore;
  tasks: TasksRepository;
  chats?: ChatsRepository;
  operations?: ProjectOperationMutex;
};

export type MergeStrategy = 'squash';

export type MergeInput = {
  taskId: string;
  strategy: MergeStrategy;
  commitMessage: string;
  repoPath: string;
  runtimePath?: string;
};

export type MergeResult = { mergedSha: string };

export type MergeService = {
  mergeTask(input: MergeInput): Promise<MergeResult>;
};

const GIT_AUTHOR_EMAIL = 'pi-agent@local';
const GIT_AUTHOR_NAME = 'Pi Agent';

const MERGE_ALLOWED_STATES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'idle',
  'needs_review',
]);

export function createMergeService(
  db: DatabaseSync,
  deps: MergeDeps,
  git: RunGit = runGit,
): MergeService {
  void db;
  const authorConfig = [`user.email=${GIT_AUTHOR_EMAIL}`, `user.name=${GIT_AUTHOR_NAME}`];
  const operations = deps.operations ?? new InMemoryProjectOperationMutex();

  return {
    async mergeTask(input) {
      const requestedTask = deps.tasks.getById(input.taskId);
      if (!requestedTask) throw new Error(`task not found: ${input.taskId}`);
      return operations.run(requestedTask.projectId, async () => {
      const { taskId, strategy, commitMessage, repoPath } = input;

      const task = deps.tasks.getById(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);

      if (!MERGE_ALLOWED_STATES.has(task.status)) {
        throw new Error(
          `merge disabled: task status '${task.status}' not in {idle, needs_review}`,
        );
      }

      const branchName = task.branchName;
      const target = task.mergeTarget;

      if (strategy !== 'squash') {
        throw new Error(`merge strategy '${String(strategy)}' is not allowed; use squash`);
      }

      // Preconditions are not merge conflicts. Validate them before changing
      // lifecycle state so a user can fix the primary checkout and retry.
      const primaryStatus = git(['status', '--porcelain'], { cwd: repoPath }).stdout;
      if (primaryStatus) throw new Error('integration checkout requires a clean primary worktree');
      const primaryBranch = git(['branch', '--show-current'], { cwd: repoPath }).stdout;
      if (primaryBranch !== target) {
        throw new Error(`integration checkout requires primary branch '${target}', got '${primaryBranch || 'detached'}'`);
      }
      const integrationPath = join(input.runtimePath ?? join(repoPath, '.pi-agents'), 'integration', taskId);
      if (existsSync(integrationPath)) {
        throw new Error(`integration worktree already exists: ${integrationPath}`);
      }
      const targetSha = git(['rev-parse', target], { cwd: repoPath }).stdout;

      deps.tasks.updateStatus(taskId, 'merge_running');
      try {
        await deps.events.append({
          stream: 'task',
          streamId: taskId,
          type: 'merge.started',
          payload: { taskId, strategy, target, branchName },
        });

        git(['worktree', 'add', '--detach', integrationPath, targetSha], { cwd: repoPath });
        try {
          git(['merge', '--squash', branchName], { cwd: integrationPath });
          git(
            ['-c', authorConfig[0], '-c', authorConfig[1], 'commit', '-m', commitMessage],
            { cwd: integrationPath },
          );
          const mergedSha = git(['rev-parse', 'HEAD'], { cwd: integrationPath }).stdout;
          git(['reset', '--hard', mergedSha], { cwd: repoPath });

          deps.tasks.update(taskId, { currentHeadSha: mergedSha });
          deps.tasks.updateStatus(taskId, 'merged');
          if (task.sourceChatId) {
            const chat = deps.chats?.getById(task.sourceChatId);
            if (chat?.activeTaskId === taskId) deps.chats?.update(chat.id, { activeTaskId: null });
          }

          await deps.events.append({
            stream: 'task', streamId: taskId, type: 'merge.completed',
            payload: { taskId, strategy, mergedSha, target },
          });

          for (const sibling of deps.tasks.listByProject(task.projectId)) {
            if (sibling.id === taskId || !['idle', 'needs_review'].includes(sibling.status)) continue;
            const stale = await deps.worktree.detectStaleBranch({
              repoPath, branchName: sibling.branchName, baseBranch: sibling.mergeTarget,
            });
            if (!stale.stale) continue;
            deps.tasks.updateStatus(sibling.id, 'stale');
            await deps.events.append({
              stream: 'task', streamId: sibling.id, type: 'task.status.changed',
              payload: { taskId: sibling.id, status: 'stale', behindMain: stale.behind },
            });
          }

          return { mergedSha };
        } finally {
          git(['worktree', 'remove', '--force', integrationPath], { cwd: repoPath });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        deps.tasks.updateStatus(taskId, 'merge_conflict');
        await deps.events.append({
          stream: 'task',
          streamId: taskId,
          type: 'merge.conflict',
          payload: { taskId, strategy, error: message },
        });
        throw err;
      }
      });
    },
  };
}
