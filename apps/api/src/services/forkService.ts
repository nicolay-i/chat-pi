import type { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Checkpoint, Task, RunMode } from '@pi-agents/contracts';
import type { TasksRepository } from '../db';
import { createCheckpointsRepository } from '../db/repositories/checkpointsRepository';
import type { EventStore } from '../realtime/eventStore';
import { runGit, type RunGit } from './gitExec';
import type { GitWorktreeService, WorktreeRef } from './gitWorktreeService';
import { createPiSessionBranch } from './piSessionBranch';

export type ForkDeps = {
  worktree: GitWorktreeService;
  events: EventStore;
  tasks: TasksRepository;
};

export type ForkFromCheckpointInput = {
  taskId: string;
  checkpointId: string;
  newTaskId: string;
  repoPath: string;
  runtimePath: string;
  title?: string;
  piSessionId?: string | null;
  piSessionPath?: string;
  sourceChatId?: string | null;
  clonePiSessionPath?: string;
  pendingPiForkEntryId?: string | null;
};

export type ForkResult = { task: Task; worktree: WorktreeRef };

export type ForkService = {
  forkFromCheckpoint(input: ForkFromCheckpointInput): Promise<ForkResult>;
  getCheckpoint(checkpointId: string): Checkpoint | undefined;
};

export function createForkService(
  db: DatabaseSync,
  deps: ForkDeps,
  git: RunGit = runGit,
): ForkService {
  const checkpoints = createCheckpointsRepository(db);
  const tasks = deps.tasks;

  return {
    getCheckpoint(checkpointId) {
      return checkpoints.getById(checkpointId);
    },
    async forkFromCheckpoint(input) {
      const { taskId, checkpointId, newTaskId, repoPath, runtimePath } = input;

      const cp = checkpoints.getById(checkpointId);
      if (!cp) throw new Error(`checkpoint not found: ${checkpointId}`);
      if (!cp.sha) throw new Error(`checkpoint ${checkpointId} has no after_sha`);
      const afterSha = cp.sha;

      const sourceTask = tasks.getById(taskId);
      if (!sourceTask) throw new Error(`source task not found: ${taskId}`);

      const branchName = `agents/task/${newTaskId}`;
      const worktreesRoot = join(runtimePath, 'worktrees');
      mkdirSync(worktreesRoot, { recursive: true });
      const worktreePath = join(worktreesRoot, newTaskId);

      git(['branch', branchName, afterSha], { cwd: repoPath });
      git(['worktree', 'add', worktreePath, branchName], { cwd: repoPath });

      const baseBranch = sourceTask.baseBranch;
      const mergeTarget = sourceTask.mergeTarget;
      const title = input.title ?? `${sourceTask.title} (fork @ ${cp.id.slice(0, 8)})`;
      const piSessionPath = input.piSessionPath ?? join(runtimePath, 'sessions', `${newTaskId}.jsonl`);
      if (input.clonePiSessionPath && existsSync(input.clonePiSessionPath)) {
        mkdirSync(join(runtimePath, 'sessions'), { recursive: true });
        if (input.pendingPiForkEntryId) {
          if (!createPiSessionBranch({
            sourcePath: input.clonePiSessionPath,
            destinationPath: piSessionPath,
            leafEntryId: input.pendingPiForkEntryId,
            cwd: worktreePath,
          })) {
            throw new Error(`checkpoint Pi entry ${input.pendingPiForkEntryId} is not present in session history`);
          }
        } else {
          copyFileSync(input.clonePiSessionPath, piSessionPath);
        }
      }

      const rec = tasks.create({
        id: newTaskId,
        projectId: sourceTask.projectId,
        sourceChatId: input.sourceChatId ?? sourceTask.sourceChatId,
        title,
        mode: sourceTask.mode as RunMode,
        status: 'created',
        baseBranch,
        baseSha: afterSha,
        branchName,
        worktreePath,
        piSessionPath,
        piSessionId: input.piSessionId ?? sourceTask.piSessionId,
        startPiEntryId: cp.piEntryId,
        endPiEntryId: cp.piEntryId,
        // The JSONL branch is already positioned at the checkpoint leaf. Pi
        // RPC `fork` only branches before a user message, which is unsuitable
        // for a completed checkpoint after an assistant response.
        pendingPiForkEntryId: null,
        mergeTarget,
        currentHeadSha: afterSha,
      });

      const task: Task = {
        id: rec.id,
        projectId: rec.projectId,
        sourceChatId: rec.sourceChatId ?? undefined,
        title: rec.title,
        mode: rec.mode,
        status: rec.status,
        piSessionId: rec.piSessionId ?? '',
        branchName: rec.branchName,
        worktreePath: rec.worktreePath,
        baseSha: rec.baseSha,
        currentHeadSha: rec.currentHeadSha,
        startPiEntryId: rec.startPiEntryId,
        endPiEntryId: rec.endPiEntryId,
        changedFiles: 0,
        updatedAt: rec.updatedAt,
      };

      await deps.events.append({
        stream: 'task',
        streamId: newTaskId,
        type: 'task.status.changed',
        payload: {
          taskId: newTaskId,
          forkedFrom: taskId,
          checkpointId,
          status: 'created',
          sha: afterSha,
        },
      });

      return {
        task,
        worktree: { branchName, worktreePath, baseSha: afterSha },
      };
    },
  };
}
