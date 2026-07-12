import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createDb } from '../db';
import { migrate } from '../migrations';
import { createProjectsRepository, type ProjectInput } from '../repositories/projectsRepository';
import { createChatsRepository, type ChatInput } from '../repositories/chatsRepository';
import { createTasksRepository, type TaskInput } from '../repositories/tasksRepository';
import { createEventsRepository, type ChatEventInput } from '../repositories/eventsRepository';
import { createPiSessionsRepository } from '../repositories/piSessionsRepository';

const sampleProject: ProjectInput = {
  name: 'demo',
  repoPath: '/repos/demo',
  defaultBranch: 'main',
  runtimeStatePath: '.pi/runtime.json',
};

function newDb(): DatabaseSync {
  return createDb(':memory:');
}

describe('migrations', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = newDb();
  });

  it('applies cleanly to a fresh in-memory db', () => {
    expect(() => migrate(db)).not.toThrow();
  });

  it('is idempotent (re-running does not throw)', () => {
    expect(() => migrate(db)).not.toThrow();
  });
});

describe('projects repository', () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = newDb();
  });

  it('CRUD: create -> getById -> list -> update -> delete', () => {
    const projects = createProjectsRepository(db);
    const created = projects.create(sampleProject);
    expect(created.id).toBeTruthy();

    const fetched = projects.getById(created.id);
    expect(fetched?.name).toBe('demo');
    expect(fetched?.repoPath).toBe('/repos/demo');
    expect(fetched?.agentsDir).toBe('.agents');

    expect(projects.list().map((p) => p.id)).toContain(created.id);

    const updated = projects.update(created.id, { name: 'renamed' });
    expect(updated?.name).toBe('renamed');
    expect(updated?.updatedAt).not.toBe(created.updatedAt);

    projects.delete(created.id);
    expect(projects.list()).toHaveLength(0);
  });
});

describe('chats repository', () => {
  let db: DatabaseSync;
  let projectId: string;
  beforeEach(() => {
    db = newDb();
    projectId = createProjectsRepository(db).create(sampleProject).id;
  });

  it('CRUD + listByProject + archive', () => {
    const chats = createChatsRepository(db);
    const chatInput: ChatInput = { projectId, title: 'hello', mode: 'discussion' };
    const created = chats.create(chatInput);
    expect(created.projectId).toBe(projectId);

    expect(chats.getById(created.id)?.title).toBe('hello');
    expect(chats.listByProject(projectId)).toHaveLength(1);

    const archived = chats.archive(created.id);
    expect(archived?.archivedAt).toBeTruthy();

    const updated = chats.update(created.id, { title: 'renamed chat' });
    expect(updated?.title).toBe('renamed chat');
  });

  it('enforces foreign key on chat.project_id', () => {
    const chats = createChatsRepository(db);
    expect(() =>
      chats.create({ projectId: 'does-not-exist', title: 'x', mode: 'discussion' }),
    ).toThrow();
  });
});

describe('tasks repository', () => {
  let db: DatabaseSync;
  let projectId: string;
  beforeEach(() => {
    db = newDb();
    projectId = createProjectsRepository(db).create(sampleProject).id;
  });

  it('CRUD + updateStatus transition + listByStatus', () => {
    const tasks = createTasksRepository(db);
    const input: TaskInput = {
      projectId,
      title: 'do thing',
      mode: 'implementation',
      status: 'created',
      baseBranch: 'main',
      baseSha: 'abc123',
      branchName: 'pi/do-thing',
      worktreePath: '/wt/do-thing',
      piSessionPath: '.pi/sessions/do-thing',
      mergeTarget: 'main',
    };
    const created = tasks.create(input);
    expect(created.status).toBe('created');

    expect(tasks.getById(created.id)?.title).toBe('do thing');
    expect(tasks.listByProject(projectId)).toHaveLength(1);

    const moved = tasks.updateStatus(created.id, 'queued');
    expect(moved?.status).toBe('queued');
    expect(tasks.listByStatus('queued').map((t) => t.id)).toContain(created.id);
    expect(tasks.listByStatus('created')).toHaveLength(0);

    const patched = tasks.update(created.id, { currentHeadSha: 'def456' });
    expect(patched?.currentHeadSha).toBe('def456');
  });
});

describe('Pi sessions repository', () => {
  it('uses owner-scoped heartbeats and allows takeover only after lock expiry', () => {
    const db = newDb();
    const projectId = createProjectsRepository(db).create(sampleProject).id;
    let now = new Date('2026-07-12T00:00:00.000Z');
    const sessions = createPiSessionsRepository(db, {
      clock: () => now,
      defaultLockTtlMs: 1_000,
    });
    const session = sessions.create({ projectId, taskId: 'task-1', path: '/sessions/task-1.jsonl', cwd: '/worktree/task-1' });

    expect(sessions.acquireLock(session.id, 'api-a')).toBe(true);
    now = new Date(now.getTime() + 500);
    expect(sessions.heartbeatLock(session.id, 'api-a')).toBe(true);
    now = new Date(now.getTime() + 800);
    expect(sessions.acquireLock(session.id, 'api-b')).toBe(false);

    now = new Date(now.getTime() + 1_001);
    expect(sessions.acquireLock(session.id, 'api-b')).toBe(true);
    expect(sessions.getById(session.id)).toMatchObject({ lockOwner: 'api-b' });
    expect(sessions.heartbeatLock(session.id, 'api-a')).toBe(false);
    expect(sessions.releaseLock(session.id, 'api-a')).toBe(false);

    now = new Date(now.getTime() + 1_001);
    expect(sessions.releaseExpiredLocks()).toBe(1);
    expect(sessions.getById(session.id)).toMatchObject({ lockOwner: null, lockHeartbeatAt: null });
  });
});

describe('events repository', () => {
  let db: DatabaseSync;
  let projectId: string;
  beforeEach(() => {
    db = newDb();
    projectId = createProjectsRepository(db).create(sampleProject).id;
  });

  function appendEvent(repo: ReturnType<typeof createEventsRepository>, chatId: string, n: number) {
    return repo.append({
      projectId,
      chatId,
      source: 'chat',
      type: 'message.created',
      payload: { n },
    });
  }

  it('appends and lists events in stable insert order; afterSequence paginates the tail', () => {
    const events = createEventsRepository(db);
    const chats = createChatsRepository(db);
    const chatId = chats.create({ projectId, title: 'c1', mode: 'discussion' }).id;

    const ev1 = appendEvent(events, chatId, 1);
    const ev2 = appendEvent(events, chatId, 2);
    const ev3 = appendEvent(events, chatId, 3);

    const ordered = events.listByChat(chatId).map((e) => e.id);
    expect(ordered).toEqual([ev1.id, ev2.id, ev3.id]);

    const tail = events.listByChat(chatId, ev2.sequence).map((e) => e.id);
    expect(tail).toEqual([ev3.id]);

    expect(events.listByChat(chatId, ev3.sequence)).toHaveLength(0);
  });

  it('scopes listByChat to a single chat', () => {
    const events = createEventsRepository(db);
    const chats = createChatsRepository(db);
    const chatA = chats.create({ projectId, title: 'a', mode: 'discussion' }).id;
    const chatB = chats.create({ projectId, title: 'b', mode: 'discussion' }).id;

    appendEvent(events, chatA, 1);
    appendEvent(events, chatA, 2);
    appendEvent(events, chatB, 3);

    expect(events.listByChat(chatA)).toHaveLength(2);
    expect(events.listByChat(chatB)).toHaveLength(1);
    expect(events.listByProject(projectId)).toHaveLength(3);
  });

  it('maps rows to RealtimeEnvelope shape', () => {
    const events = createEventsRepository(db);
    const chats = createChatsRepository(db);
    const chatId = chats.create({ projectId, title: 'c', mode: 'discussion' }).id;
    const ev = appendEvent(events, chatId, 1);
    expect(ev.stream).toBe('chat');
    expect(ev.streamId).toBe(chatId);
    expect(ev.type).toBe('message.created');
    expect(ev.payload).toEqual({ n: 1 });
  });
});
