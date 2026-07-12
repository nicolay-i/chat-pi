import type { Task } from '@pi-agents/contracts';
import type { ChatsRepository } from '../db/repositories/chatsRepository';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';
import type { TasksRepository } from '../db/repositories/tasksRepository';
import type { QueuedMessagesRepository } from '../db/repositories/queuedMessagesRepository';
import type { EventStore } from '../realtime/eventStore';
import { isValidStatusTransition } from './taskStatus';
import type { GitWorktreeService } from './gitWorktreeService';

export type TaskCancellationMode = 'archive' | 'discard';

export type TaskCancellationDeps = {
  tasks: TasksRepository;
  projects: ProjectsRepository;
  chats: ChatsRepository;
  worktree: GitWorktreeService;
  events: EventStore;
  queuedMessages?: QueuedMessagesRepository;
};

export type TaskCancellationService = {
  cancel(taskId: string, mode: TaskCancellationMode): Promise<Task>;
};

function toTask(task: ReturnType<TasksRepository['getById']> extends infer R ? Exclude<R, undefined> : never): Task {
  return {
    id: task.id,
    projectId: task.projectId,
    sourceChatId: task.sourceChatId ?? undefined,
    title: task.title,
    mode: task.mode,
    status: task.status,
    piSessionId: task.piSessionId ?? '',
    branchName: task.branchName,
    worktreePath: task.worktreePath,
    baseSha: task.baseSha,
    currentHeadSha: task.currentHeadSha,
    startPiEntryId: task.startPiEntryId,
    endPiEntryId: task.endPiEntryId,
    changedFiles: 0,
    updatedAt: task.updatedAt,
  };
}

export function createTaskCancellationService(deps: TaskCancellationDeps): TaskCancellationService {
  return {
    async cancel(taskId, mode) {
      const task = deps.tasks.getById(taskId);
      if (!task) throw new Error(`task not found: ${taskId}`);
      if (['queued', 'running', 'aborting', 'merge_running'].includes(task.status)) {
        throw new Error(`cancel disabled while task is ${task.status}`);
      }
      const status = mode === 'discard' ? 'cancelled_discarded' : 'cancelled_archived';
      if (!isValidStatusTransition(task.status, status)) {
        throw new Error(`cannot cancel task in status ${task.status}`);
      }
      const project = deps.projects.getById(task.projectId);
      if (!project) throw new Error(`project not found: ${task.projectId}`);
      if (mode === 'discard') {
        await deps.worktree.removeTaskWorktree({
          repoPath: project.repoPath,
          worktreePath: task.worktreePath,
          branchName: task.branchName,
        });
      }
      const updated = deps.tasks.updateStatus(task.id, status);
      if (!updated) throw new Error(`task not found: ${taskId}`);
      if (task.sourceChatId) {
        const chat = deps.chats.getById(task.sourceChatId);
        if (chat?.activeTaskId === task.id) {
          deps.queuedMessages?.clear(chat.id);
          deps.chats.update(chat.id, { activeTaskId: null });
        }
      }
      await deps.events.append({
        stream: 'task',
        streamId: task.id,
        projectId: task.projectId,
        chatId: task.sourceChatId ?? undefined,
        taskId: task.id,
        piSessionId: task.piSessionId ?? undefined,
        type: 'task.status.changed',
        payload: { taskId: task.id, status, cancelMode: mode },
      });
      return toTask(updated);
    },
  };
}
