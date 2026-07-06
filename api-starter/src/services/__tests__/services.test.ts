import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createDb } from '../../db';
import { createTasksRepository } from '../../db';
import { createProjectService } from '../projectService';
import { createChatService } from '../chatService';
import { createTaskService } from '../taskService';
import { GitWorktreeService } from '../gitWorktreeService';
import {
  isValidStatusTransition,
  canTransitionTo,
  VALID_STATUSES,
} from '../taskStatus';
import type { TaskStatus } from '@pi-agents/contracts';

function makeFakeWorktree(): GitWorktreeService {
  const fake = {
    async createTaskWorktree(input: {
      taskId: string;
      runtimePath: string;
    }): Promise<{
      branchName: string;
      worktreePath: string;
      baseSha: string;
    }> {
      return {
        branchName: `agents/task/${input.taskId}`,
        worktreePath: `${input.runtimePath}/worktrees/${input.taskId}`,
        baseSha: 'fakebase',
      };
    },
  };
  return fake as unknown as GitWorktreeService;
}

function setup() {
  const db: DatabaseSync = createDb(':memory:');
  const worktree = makeFakeWorktree();
  const projects = createProjectService(db);
  const tasks = createTaskService(db, { worktree });
  const chats = createChatService(db, { tasks });
  return { db, projects, tasks, chats };
}

describe('taskStatus', () => {
  it('reports the full set of valid statuses', () => {
    expect(VALID_STATUSES.size).toBe(15);
    expect(VALID_STATUSES.has('created')).toBe(true);
    expect(VALID_STATUSES.has('archived')).toBe(true);
  });

  it('allows valid transitions and rejects invalid ones', () => {
    expect(isValidStatusTransition('created', 'idle')).toBe(true);
    expect(isValidStatusTransition('idle', 'queued')).toBe(true);
    expect(isValidStatusTransition('queued', 'running')).toBe(true);
    expect(isValidStatusTransition('running', 'needs_review')).toBe(true);

    expect(isValidStatusTransition('created', 'running')).toBe(false);
    expect(isValidStatusTransition('archived', 'idle')).toBe(false);
    expect(isValidStatusTransition('idle', 'merged')).toBe(false);
  });

  it('is idempotent for same->same and exposes canTransitionTo alias', () => {
    expect(isValidStatusTransition('running', 'running')).toBe(true);
    expect(canTransitionTo('idle', 'idle')).toBe(true);
  });
});

describe('projectService', () => {
  let projects: ReturnType<typeof createProjectService>;
  beforeEach(() => {
    ({ projects } = setup());
  });

  it('create -> get -> list -> update -> delete', async () => {
    const created = await projects.create({
      name: 'demo',
      repoPath: '/repos/demo',
      defaultBranch: 'main',
    });
    expect(created.id).toBeTruthy();
    expect(created.agentsDir).toBe('.agents');

    const fetched = await projects.get(created.id);
    expect(fetched?.name).toBe('demo');

    const list = await projects.list();
    expect(list.map((p) => p.id)).toContain(created.id);

    const updated = await projects.update(created.id, { name: 'renamed' });
    expect(updated?.name).toBe('renamed');

    await projects.remove(created.id);
    expect(await projects.get(created.id)).toBeUndefined();
    expect(await projects.list()).toHaveLength(0);
  });
});

describe('chatService', () => {
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    env = setup();
  });

  it('discussion chat does NOT create a task or worktree', async () => {
    const { projects, chats, tasks, db } = env;
    const project = await projects.create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
    });

    const chat = await chats.create(project.id, { mode: 'discussion' });

    expect(chat.activeTaskId).toBeUndefined();
    const taskList = await tasks.listByProject(project.id);
    expect(taskList).toHaveLength(0);
    const rawTasks = createTasksRepository(db).listByProject(project.id);
    expect(rawTasks).toHaveLength(0);
  });

  it('implementation chat without createTask does NOT create a task', async () => {
    const { projects, chats, tasks } = env;
    const project = await projects.create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
    });

    const chat = await chats.create(project.id, { mode: 'implementation' });

    expect(chat.activeTaskId).toBeUndefined();
    expect(await tasks.listByProject(project.id)).toHaveLength(0);
  });

  it('implementation chat with createTask creates a writable task', async () => {
    const { projects, chats, tasks } = env;
    const project = await projects.create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
    });

    const chat = await chats.create(project.id, {
      mode: 'implementation',
      createTask: true,
      title: 'do thing',
    });

    const taskList = await tasks.listByProject(project.id);
    expect(taskList).toHaveLength(1);
    const task = taskList[0];
    expect(task.branchName.startsWith('agents/task/')).toBe(true);
    expect(task.worktreePath.length).toBeGreaterThan(0);
    expect(chat.activeTaskId).toBe(task.id);
    expect(['created', 'idle']).toContain(task.status);
    expect(task.mode).toBe('implementation');
  });

  it('planning chat does not create a task even with createTask set', async () => {
    const { projects, chats, tasks } = env;
    const project = await projects.create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
    });

    await chats.create(project.id, { mode: 'planning', createTask: true });

    expect(await tasks.listByProject(project.id)).toHaveLength(0);
  });
});

describe('taskService.updateStatus', () => {
  let env: ReturnType<typeof setup>;

  beforeEach(() => {
    env = setup();
  });

  it('accepts a valid status chain: created -> idle -> queued -> running', async () => {
    const { projects, chats, tasks } = env;
    const project = await projects.create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
    });
    await chats.create(project.id, { mode: 'implementation', createTask: true });
    const task = (await tasks.listByProject(project.id))[0];

    const idle = await tasks.updateStatus(task.id, 'idle');
    expect(idle.status).toBe('idle');
    const queued = await tasks.updateStatus(task.id, 'queued');
    expect(queued.status).toBe('queued');
    const running = await tasks.updateStatus(task.id, 'running');
    expect(running.status).toBe('running');
  });

  it('rejects an invalid transition (created -> running)', async () => {
    const { projects, chats, tasks } = env;
    const project = await projects.create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
    });
    await chats.create(project.id, { mode: 'implementation', createTask: true });
    const task = (await tasks.listByProject(project.id))[0];

    await expect(tasks.updateStatus(task.id, 'running')).rejects.toThrow(
      /invalid status transition/,
    );
  });

  it('listByStatus scopes tasks by status', async () => {
    const { projects, chats, tasks } = env;
    const project = await projects.create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
    });
    await chats.create(project.id, { mode: 'implementation', createTask: true });
    const task = (await tasks.listByProject(project.id))[0];

    const createdBefore: TaskStatus[] = (await tasks.listByStatus('created')).map(
      (t) => t.status,
    );
    expect(createdBefore).toEqual(['created']);

    await tasks.updateStatus(task.id, 'idle');
    expect(await tasks.listByStatus('created')).toHaveLength(0);
    expect(await tasks.listByStatus('idle')).toHaveLength(1);
  });
});
