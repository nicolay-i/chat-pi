import type { DatabaseSync } from 'node:sqlite';
import type { Task, RunMode, TaskStatus } from '@pi-agents/contracts';
import {
  createTasksRepository,
  createChatsRepository,
  createPiSessionsRepository,
  createProjectsRepository,
  type TaskRecord,
} from '../db';
import type { GitWorktreeService } from './gitWorktreeService';
import { isValidStatusTransition } from './taskStatus';

export type CreateTaskForChatInput = {
  title: string;
  mode: RunMode;
};

export type TaskPatch = {
  title?: string;
  baseSha?: string;
  currentHeadSha?: string | null;
  mergeTarget?: string;
  startPiEntryId?: string | null;
  endPiEntryId?: string | null;
  lastRunId?: string | null;
};

export interface TaskServiceDeps {
  worktree: GitWorktreeService;
}

export interface TaskService {
  createForChat(
    projectId: string,
    chatId: string,
    input: CreateTaskForChatInput,
  ): Promise<Task>;
  get(id: string): Promise<Task | undefined>;
  listByProject(projectId: string): Promise<Task[]>;
  listByStatus(status: TaskStatus): Promise<Task[]>;
  updateStatus(id: string, next: TaskStatus): Promise<Task>;
  update(id: string, patch: TaskPatch): Promise<Task | undefined>;
}

function toTask(rec: TaskRecord): Task {
  return {
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
}

export function createTaskService(db: DatabaseSync, deps: TaskServiceDeps): TaskService {
  const tasks = createTasksRepository(db);
  const chats = createChatsRepository(db);
  const piSessions = createPiSessionsRepository(db);
  const projects = createProjectsRepository(db);
  return {
    async createForChat(projectId, chatId, input) {
      const project = projects.getById(projectId);
      if (!project) throw new Error(`project not found: ${projectId}`);
      const chat = chats.getById(chatId);
      if (!chat || chat.projectId !== projectId) throw new Error(`chat not found: ${chatId}`);
      const sessionId = chat.piSessionId ?? chat.activePiSessionId;
      if (!sessionId) throw new Error(`chat ${chatId} has no PiSession`);
      const session = piSessions.getById(sessionId);
      if (!session || session.chatId !== chatId) throw new Error(`PiSession for chat ${chatId} not found`);
      const writableStatuses: TaskStatus[] = [
        'created', 'creating_worktree', 'idle', 'queued', 'running', 'aborting',
        'paused_clean', 'paused_dirty', 'paused_after_restart',
      ];
      const activeTask = tasks.listByChatId(chatId).find((task) => writableStatuses.includes(task.status));
      if (activeTask) throw new Error(`chat ${chatId} already has an active writable task: ${activeTask.id}`);
      const taskId = crypto.randomUUID();
      const { branchName, worktreePath, baseSha } = await deps.worktree.createTaskWorktree({
        repoPath: project.repoPath,
        taskId,
        baseBranch: project.defaultBranch,
        runtimePath: project.runtimeStatePath,
      });
      const rec = tasks.create({
        id: taskId,
        projectId,
        sourceChatId: chatId,
        title: input.title,
        mode: input.mode,
        status: 'created',
        baseBranch: project.defaultBranch,
        baseSha,
        branchName,
        worktreePath,
        piSessionPath: session.path,
        piSessionId: session.id,
        mergeTarget: project.defaultBranch,
        currentHeadSha: baseSha,
      });
      return toTask(rec);
    },
    async get(id) {
      const rec = tasks.getById(id);
      return rec ? toTask(rec) : undefined;
    },
    async listByProject(projectId) {
      return tasks.listByProject(projectId).map(toTask);
    },
    async listByStatus(status) {
      return tasks.listByStatus(status).map(toTask);
    },
    async updateStatus(id, next) {
      const current = tasks.getById(id);
      if (!current) throw new Error(`task not found: ${id}`);
      if (!isValidStatusTransition(current.status, next)) {
        throw new Error(
          `invalid status transition: ${current.status} -> ${next}`,
        );
      }
      const rec = tasks.updateStatus(id, next);
      if (!rec) throw new Error(`task not found: ${id}`);
      return toTask(rec);
    },
    async update(id, patch) {
      const rec = tasks.update(id, patch);
      return rec ? toTask(rec) : undefined;
    },
  };
}
