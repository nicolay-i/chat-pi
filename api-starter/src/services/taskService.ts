import type { DatabaseSync } from 'node:sqlite';
import type { Task, RunMode, TaskStatus } from '@pi-agents/contracts';
import {
  createTasksRepository,
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
    branchName: rec.branchName,
    worktreePath: rec.worktreePath,
    changedFiles: 0,
    updatedAt: rec.updatedAt,
  };
}

export function createTaskService(db: DatabaseSync, deps: TaskServiceDeps): TaskService {
  const tasks = createTasksRepository(db);
  const projects = createProjectsRepository(db);
  return {
    async createForChat(projectId, chatId, input) {
      const project = projects.getById(projectId);
      if (!project) throw new Error(`project not found: ${projectId}`);
      const taskId = crypto.randomUUID();
      const baseSha = 'HEAD';
      const { branchName, worktreePath } = await deps.worktree.createTaskWorktree({
        repoPath: project.repoPath,
        taskId,
        baseSha,
        runtimePath: project.runtimeStatePath,
      });
      const piSessionPath = `${project.runtimeStatePath}/sessions/${taskId}`;
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
        piSessionPath,
        mergeTarget: project.defaultBranch,
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
