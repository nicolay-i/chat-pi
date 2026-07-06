import type { DatabaseSync } from 'node:sqlite';
import type { TasksRepository } from '../db';
import type { EventStore } from '../realtime/eventStore';
import { runGit, type RunGit } from './gitExec';
import type { GitWorktreeService } from './gitWorktreeService';
import type { TaskStatus } from '@pi-agents/contracts';

export type MergeDeps = {
  worktree: GitWorktreeService;
  events: EventStore;
  tasks: TasksRepository;
};

export type MergeStrategy = 'squash' | 'merge' | 'rebase' | 'patch';

export type MergeInput = {
  taskId: string;
  strategy: MergeStrategy;
  commitMessage: string;
  repoPath: string;
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
  void deps.worktree;

  const authorConfig = [`user.email=${GIT_AUTHOR_EMAIL}`, `user.name=${GIT_AUTHOR_NAME}`];

  return {
    async mergeTask(input) {
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

      deps.tasks.updateStatus(taskId, 'merge_running');
      try {
        await deps.events.append({
          stream: 'task',
          streamId: taskId,
          type: 'merge.started',
          payload: { taskId, strategy, target, branchName },
        });

        if (strategy === 'squash') {
          git(['checkout', target], { cwd: repoPath });
          git(['merge', '--squash', branchName], { cwd: repoPath });
          git(
            ['-c', authorConfig[0], '-c', authorConfig[1], 'commit', '-m', commitMessage],
            { cwd: repoPath },
          );
        } else if (strategy === 'merge') {
          git(['checkout', target], { cwd: repoPath });
          git(
            [
              '-c',
              authorConfig[0],
              '-c',
              authorConfig[1],
              'merge',
              '--no-ff',
              branchName,
              '-m',
              commitMessage,
            ],
            { cwd: repoPath },
          );
        } else if (strategy === 'rebase') {
          git(['checkout', branchName], { cwd: repoPath });
          git(['rebase', target], { cwd: repoPath });
          git(['checkout', target], { cwd: repoPath });
          git(['merge', '--ff-only', branchName], { cwd: repoPath });
        } else {
          throw new Error(
            `merge strategy '${strategy}' not implemented; use squash or merge`,
          );
        }

        const mergedSha = git(['rev-parse', 'HEAD'], { cwd: repoPath }).stdout;

        deps.tasks.update(taskId, { currentHeadSha: mergedSha });
        deps.tasks.updateStatus(taskId, 'merged');

        await deps.events.append({
          stream: 'task',
          streamId: taskId,
          type: 'merge.completed',
          payload: { taskId, strategy, mergedSha, target },
        });

        return { mergedSha };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await deps.events.append({
          stream: 'task',
          streamId: taskId,
          type: 'merge.conflict',
          payload: { taskId, strategy, error: message },
        });
        throw err;
      }
    },
  };
}
