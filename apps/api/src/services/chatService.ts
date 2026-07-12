import type { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { Chat, CreateChatInput, ManagedImplementation, RunMode } from '@pi-agents/contracts';
import {
  createChatsRepository,
  createPiSessionsRepository,
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
  createManagedImplementation(orchestrationChatId: string, title: string): Promise<ManagedImplementation>;
  listManagedImplementations(orchestrationChatId: string): Promise<ManagedImplementation[]>;
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
    piSessionId: rec.piSessionId ?? rec.activePiSessionId ?? '',
    parentChatId: rec.parentChatId,
    activeLeafEntryId: rec.activeLeafEntryId,
    updatedAt: rec.updatedAt,
  };
}

export function createChatService(db: DatabaseSync, deps: ChatServiceDeps): ChatService {
  const chats = createChatsRepository(db);
  const piSessions = createPiSessionsRepository(db);
  const projects = createProjectsRepository(db);
  const toManaged = async (chat: Chat): Promise<ManagedImplementation> => {
    if (!chat.activeTaskId) throw new Error(`implementation chat ${chat.id} has no active task`);
    const task = await deps.tasks.get(chat.activeTaskId);
    if (!task) throw new Error(`task not found: ${chat.activeTaskId}`);
    return { chat, task };
  };
  return {
    async create(projectId, input) {
      const project = projects.getById(projectId);
      if (!project) throw new Error(`project not found: ${projectId}`);
      const created = chats.create({
        projectId,
        title: input.title ?? 'New chat',
        mode: input.mode,
      });
      const session = piSessions.create({
        projectId,
        chatId: created.id,
        path: join(project.runtimeStatePath, 'sessions', `${created.id}.jsonl`),
        cwd: project.repoPath,
      });
      const sessionBound = chats.update(created.id, {
        piSessionId: session.id,
        activePiSessionId: session.id,
        activeLeafEntryId: null,
      }) ?? created;
      if (input.mode === 'implementation' && input.createTask === true) {
        const task = await deps.tasks.createForChat(projectId, sessionBound.id, {
          title: sessionBound.title,
          mode: input.mode,
        });
        const updated = chats.update(sessionBound.id, { activeTaskId: task.id });
        return toChat(updated ?? sessionBound);
      }
      return toChat(sessionBound);
    },
    async createManagedImplementation(orchestrationChatId, title) {
      const orchestration = chats.getById(orchestrationChatId);
      if (!orchestration || orchestration.mode !== 'orchestration') {
        throw new Error(`orchestration chat not found: ${orchestrationChatId}`);
      }
      const child = chats.create({
        projectId: orchestration.projectId,
        title,
        mode: 'implementation',
        parentChatId: orchestration.id,
      });
      const project = projects.getById(orchestration.projectId);
      if (!project) throw new Error(`project not found: ${orchestration.projectId}`);
      const session = piSessions.create({
        projectId: project.id,
        chatId: child.id,
        path: join(project.runtimeStatePath, 'sessions', `${child.id}.jsonl`),
        cwd: project.repoPath,
      });
      const sessionBound = chats.update(child.id, {
        piSessionId: session.id,
        activePiSessionId: session.id,
      }) ?? child;
      const task = await deps.tasks.createForChat(project.id, sessionBound.id, {
        title,
        mode: 'implementation',
      });
      const active = chats.update(sessionBound.id, { activeTaskId: task.id }) ?? sessionBound;
      return { chat: toChat(active), task };
    },
    async listManagedImplementations(orchestrationChatId) {
      const orchestration = chats.getById(orchestrationChatId);
      if (!orchestration || orchestration.mode !== 'orchestration') {
        throw new Error(`orchestration chat not found: ${orchestrationChatId}`);
      }
      const result: ManagedImplementation[] = [];
      for (const child of chats.listByParentChatId(orchestrationChatId)) {
        const chat = toChat(child);
        if (!chat.activeTaskId) continue;
        result.push(await toManaged(chat));
      }
      return result;
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
