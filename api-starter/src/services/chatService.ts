import type { DatabaseSync } from 'node:sqlite';
import type { Chat, CreateChatInput, RunMode } from '@pi-agents/contracts';
import {
  createChatsRepository,
  createProjectsRepository,
  type ChatRecord,
} from '../db';
import type { TaskService } from './taskService';

export type ChatPatch = {
  title?: string;
  mode?: RunMode;
  activeTaskId?: string | null;
};

export interface ChatServiceDeps {
  tasks: TaskService;
}

export interface ChatService {
  create(projectId: string, input: CreateChatInput): Promise<Chat>;
  list(projectId: string): Promise<Chat[]>;
  get(id: string): Promise<Chat | undefined>;
  update(id: string, patch: ChatPatch): Promise<Chat | undefined>;
  archive(id: string): Promise<Chat | undefined>;
}

function toChat(rec: ChatRecord): Chat {
  return {
    id: rec.id,
    projectId: rec.projectId,
    title: rec.title,
    mode: rec.mode,
    activeTaskId: rec.activeTaskId ?? undefined,
    updatedAt: rec.updatedAt,
  };
}

export function createChatService(db: DatabaseSync, deps: ChatServiceDeps): ChatService {
  const chats = createChatsRepository(db);
  const projects = createProjectsRepository(db);
  return {
    async create(projectId, input) {
      const project = projects.getById(projectId);
      if (!project) throw new Error(`project not found: ${projectId}`);
      const created = chats.create({
        projectId,
        title: input.title ?? 'New chat',
        mode: input.mode,
      });
      if (input.mode === 'implementation' && input.createTask === true) {
        const task = await deps.tasks.createForChat(projectId, created.id, {
          title: created.title,
          mode: input.mode,
        });
        const updated = chats.update(created.id, { activeTaskId: task.id });
        return toChat(updated ?? created);
      }
      return toChat(created);
    },
    async list(projectId) {
      return chats.listByProject(projectId).map(toChat);
    },
    async get(id) {
      const rec = chats.getById(id);
      return rec ? toChat(rec) : undefined;
    },
    async update(id, patch) {
      const rec = chats.update(id, patch);
      return rec ? toChat(rec) : undefined;
    },
    async archive(id) {
      const rec = chats.archive(id);
      return rec ? toChat(rec) : undefined;
    },
  };
}
