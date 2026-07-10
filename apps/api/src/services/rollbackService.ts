import type { DatabaseSync } from 'node:sqlite';
import type { TasksRepository } from '../db';
import type { EventStore } from '../realtime/eventStore';
import type { ForkService } from './forkService';
import { isValidStatusTransition } from './taskStatus';

export type RollbackDeps = {
  forkService: ForkService;
  events: EventStore;
  tasks: TasksRepository;
};

export type RollbackInput = {
  taskId: string;
  checkpointId: string;
  repoPath: string;
  runtimePath: string;
};

export type RollbackResult = { newTaskId: string };

export type RollbackService = {
  rollbackToCheckpoint(input: RollbackInput): Promise<RollbackResult>;
};

/**
 * Rollback creates a NEW task forked from the checkpoint. The original task
 * branch is never destroyed; the original task is moved to 'archived' when the
 * status transition permits it (otherwise it is left in place — the fork still
 * succeeds).
 */
export function createRollbackService(
  db: DatabaseSync,
  deps: RollbackDeps,
): RollbackService {
  void db;
  return {
    async rollbackToCheckpoint(input) {
      const { taskId, checkpointId, repoPath, runtimePath } = input;

      const newTaskId = crypto.randomUUID();
      const fork = await deps.forkService.forkFromCheckpoint({
        taskId,
        checkpointId,
        newTaskId,
        repoPath,
        runtimePath,
      });

      const original = deps.tasks.getById(taskId);
      if (original && isValidStatusTransition(original.status, 'archived')) {
        deps.tasks.updateStatus(taskId, 'archived');
        await deps.events.append({
          stream: 'task',
          streamId: taskId,
          type: 'task.status.changed',
          payload: { taskId, status: 'archived', rolledBackTo: checkpointId, newTaskId },
        });
      }

      await deps.events.append({
        stream: 'task',
        streamId: newTaskId,
        type: 'task.status.changed',
        payload: {
          taskId: newTaskId,
          status: fork.task.status,
          rollbackFrom: taskId,
          checkpointId,
        },
      });

      return { newTaskId };
    },
  };
}
