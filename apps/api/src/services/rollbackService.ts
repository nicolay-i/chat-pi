import type { DatabaseSync } from 'node:sqlite';
import type { TasksRepository } from '../db';
import type { ChatsRepository } from '../db/repositories/chatsRepository';
import type { PiSessionsRepository } from '../db/repositories/piSessionsRepository';
import type { EventStore } from '../realtime/eventStore';
import type { ForkService } from './forkService';
import { isValidStatusTransition } from './taskStatus';
import { join } from 'node:path';

export type RollbackDeps = {
  forkService: ForkService;
  events: EventStore;
  tasks: TasksRepository;
  chats?: ChatsRepository;
  piSessions?: PiSessionsRepository;
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
      const original = deps.tasks.getById(taskId);
      if (!original) throw new Error(`task not found: ${taskId}`);
      if (['queued', 'running', 'aborting', 'merge_running'].includes(original.status)) {
        throw new Error(`rollback disabled while task is ${original.status}`);
      }
      const checkpoint = deps.forkService.getCheckpoint?.(checkpointId);

      const newTaskId = crypto.randomUUID();
      const branchedSessionPath = join(runtimePath, 'sessions', `${newTaskId}.jsonl`);
      const session = (original.piSessionId ? deps.piSessions?.getById(original.piSessionId) : undefined)
        ?? deps.piSessions?.getByTaskId(taskId);
      const fork = await deps.forkService.forkFromCheckpoint({
        taskId,
        checkpointId,
        newTaskId,
        repoPath,
        runtimePath,
        piSessionId: session?.id ?? original.piSessionId,
        piSessionPath: branchedSessionPath,
        clonePiSessionPath: session?.path ?? original.piSessionPath,
        pendingPiForkEntryId: checkpoint?.piEntryId ?? null,
      });

      if (original && isValidStatusTransition(original.status, 'archived')) {
        deps.tasks.updateStatus(taskId, 'archived');
        await deps.events.append({
          stream: 'task',
          streamId: taskId,
          type: 'task.status.changed',
          payload: { taskId, status: 'archived', rolledBackTo: checkpointId, newTaskId },
        });
      }

      if (session) {
        deps.piSessions?.update(session.id, {
          path: branchedSessionPath,
          activeLeafEntryId: checkpoint?.piEntryId ?? null,
        });
      }
      if (original.sourceChatId) {
        deps.chats?.update(original.sourceChatId, {
          activeTaskId: newTaskId,
          activeLeafEntryId: checkpoint?.piEntryId ?? null,
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
