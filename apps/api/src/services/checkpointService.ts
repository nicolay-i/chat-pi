import type { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Checkpoint } from '@pi-agents/contracts';
import { createCheckpointsRepository, type TasksRepository } from '../db';
import type { EventStore } from '../realtime/eventStore';
import { runGit, type RunGit } from './gitExec';
import type { GitWorktreeService } from './gitWorktreeService';

export type CheckpointDeps = {
  worktree: GitWorktreeService;
  events: EventStore;
  tasks: TasksRepository;
};

export type CreateCheckpointInput = {
  taskId: string;
  message: string;
  repoPath: string;
  worktreePath: string;
  runtimeStatePath: string;
  piSessionId?: string | null;
  piEntryId?: string | null;
};

export type CheckpointService = {
  createCheckpoint(input: CreateCheckpointInput): Promise<Checkpoint>;
  listCheckpoints(taskId: string): Checkpoint[];
  getCheckpoint(taskId: string, checkpointId: string): Checkpoint | undefined;
};

const GIT_AUTHOR_EMAIL = 'pi-agent@local';
const GIT_AUTHOR_NAME = 'Pi Agent';

export function createCheckpointService(
  db: DatabaseSync,
  deps: CheckpointDeps,
  git: RunGit = runGit,
): CheckpointService {
  const checkpoints = createCheckpointsRepository(db);

  return {
    async createCheckpoint(input) {
      const { taskId, message, worktreePath } = input;

      const beforeSha = git(['rev-parse', 'HEAD'], { cwd: worktreePath }).stdout;

      git(['add', '-A'], { cwd: worktreePath });
      git(
        [
          '-c',
          `user.email=${GIT_AUTHOR_EMAIL}`,
          '-c',
          `user.name=${GIT_AUTHOR_NAME}`,
          'commit',
          '-m',
          message,
          '--allow-empty',
        ],
        { cwd: worktreePath },
      );

      const afterSha = git(['rev-parse', 'HEAD'], { cwd: worktreePath }).stdout;

      const checkpointsDir = join(input.runtimeStatePath, 'checkpoints', taskId);
      mkdirSync(checkpointsDir, { recursive: true });

      const created = checkpoints.create({
        taskId,
        piSessionId: input.piSessionId ?? null,
        piEntryId: input.piEntryId ?? null,
        beforeSha,
        afterSha,
        summary: message,
      });

      const patchPath = join(checkpointsDir, `${created.id}.patch`);
      const patchText = git(['diff', beforeSha, afterSha], { cwd: worktreePath }).stdout;
      writeFileSync(patchPath, patchText, 'utf8');

      const final = checkpoints.update(created.id, { patchPath }) ?? created;
      const cp: Checkpoint = {
        id: final.id,
        taskId,
        message,
        sha: afterSha,
        changedFiles: 0,
        createdAt: final.createdAt,
      };

      deps.tasks.update(taskId, { currentHeadSha: afterSha });

      await deps.events.append({
        stream: 'task',
        streamId: taskId,
        type: 'checkpoint.created',
        payload: { id: final.id, message, sha: afterSha },
      });

      return cp;
    },
    listCheckpoints(taskId) {
      return checkpoints.listByTask(taskId);
    },
    getCheckpoint(taskId, checkpointId) {
      const cp = checkpoints.getById(checkpointId);
      if (!cp || cp.taskId !== taskId) return undefined;
      return cp;
    },
  };
}
