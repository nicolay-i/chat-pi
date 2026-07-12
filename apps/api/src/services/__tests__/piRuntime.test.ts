import { describe, it, expect, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RealtimeEnvelope, SendMessageInput } from '@pi-agents/contracts';
import {
  FakePiRuntime,
  PiRuntimeAdapter,
  createRuntime,
  type PiRuntime,
  type RuntimeEventHandler,
} from '../piRuntimeService';
import { RuntimeManager } from '../runtimeManager';
import { createDb } from '../../db';
import { createEventsRepository } from '../../db/repositories/eventsRepository';
import { createEventStore } from '../../realtime/eventStore';
import { createTasksRepository } from '../../db/repositories/tasksRepository';
import { createChatsRepository } from '../../db/repositories/chatsRepository';
import { createPiSessionsRepository } from '../../db/repositories/piSessionsRepository';
import { createQueuedMessagesRepository } from '../../db/repositories/queuedMessagesRepository';
import { createRuntimeProcessesRepository } from '../../db/repositories/runtimeProcessesRepository';
import { createProjectsRepository } from '../../db/repositories/projectsRepository';
import { parseJsonl } from '../piJsonl';
import { createPiSessionBranch } from '../piSessionBranch';
import type { RealtimeEventDraft } from '../../realtime/eventStore';

function collect(runtime: PiRuntime, sessionId: string): RealtimeEventDraft[] {
  const events: RealtimeEventDraft[] = [];
  runtime.subscribe(sessionId, (e) => events.push(e));
  return events;
}

const baseInput: SendMessageInput = {
  text: 'hello',
  behavior: 'send',
};

const describeRealPi = process.env.PI_REAL_E2E === '1' ? describe : describe.skip;

describeRealPi('PiRuntimeAdapter real CLI smoke', () => {
  it('streams a complete agent turn and reopens an isolated branch at its leaf entry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'pi-agents-real-runtime-'));
    const sessionId = 'real-pi-smoke';
    const sessionPath = join(root, 'sessions', `${sessionId}.jsonl`);
    const runtime = new PiRuntimeAdapter({ piBin: process.env.PI_BIN ?? 'pi.cmd' });
    const events = collect(runtime, sessionId);
    try {
      await mkdir(join(root, 'sessions'), { recursive: true });
      await runtime.prepare({ sessionId, cwd: root, sessionPath, resourceRoot: root });
      await runtime.prompt(sessionId, {
        text: 'Reply with exactly: pi-runtime-smoke',
        behavior: 'send',
      });

      expect(events.map((event) => event.type)).toEqual(
        expect.arrayContaining(['run.started', 'run.completed', 'message.completed']),
      );
      expect((await stat(sessionPath)).size).toBeGreaterThan(0);
      const entries = parseJsonl(await readFile(sessionPath, 'utf8'));
      const leafEntryId = entries.at(-1)?.id;
      expect(leafEntryId).toBeTruthy();

      const forkPath = join(root, 'sessions', 'forked.jsonl');
      expect(createPiSessionBranch({ sourcePath: sessionPath, destinationPath: forkPath, leafEntryId: leafEntryId! })).toBe(true);
      expect(parseJsonl(await readFile(forkPath, 'utf8')).some((entry) => entry.id === leafEntryId)).toBe(true);

      const forkCwd = join(root, 'fork-worktree');
      await mkdir(forkCwd, { recursive: true });
      const forkedRuntime = new PiRuntimeAdapter({ piBin: process.env.PI_BIN ?? 'pi.cmd' });
      try {
        await forkedRuntime.prepare({ sessionId: 'real-pi-fork-smoke', cwd: forkCwd, sessionPath: forkPath, resourceRoot: forkCwd });
        const header = JSON.parse((await readFile(forkPath, 'utf8')).split(/\r?\n/)[0]) as { cwd?: string };
        expect(header.cwd).toBe(forkCwd);
      } finally {
        await forkedRuntime.dispose();
      }
    } finally {
      await runtime.dispose();
      await rm(root, { recursive: true, force: true });
    }
  }, 120_000);
});

describe('FakePiRuntime', () => {
  it('prompt emits the full run/tool/message sequence in order', async () => {
    const runtime = new FakePiRuntime();
    const events = collect(runtime, 's1');
    await runtime.prompt('s1', baseInput);

    const types = events.map((e) => e.type);
    expect(types[0]).toBe('run.started');
    expect(types[types.length - 1]).toBe('run.completed');
    expect(types).toContain('message.created');
    expect(types).toContain('message.delta');
    expect(types).toContain('message.completed');
    expect(types).toContain('tool.started');
    expect(types).toContain('tool.completed');

    for (const e of events) {
      expect(e.stream).toBe('task');
      expect(e.streamId).toBe('s1');
      expect(e.id).toBeTruthy();
      expect(e.createdAt).toBeTruthy();
    }
  });

  it('enforces one runtime lock per session (reentrant for same owner)', () => {
    const runtime = new FakePiRuntime();
    expect(runtime.acquireLock('s1', 'a')).toBe(true);
    expect(runtime.acquireLock('s1', 'b')).toBe(false);
    expect(runtime.acquireLock('s1', 'a')).toBe(true);
    expect(runtime.releaseLock('s1', 'a')).toBe(true);
    expect(runtime.acquireLock('s1', 'b')).toBe(true);
  });

  it('releaseLock only succeeds for the owning owner', () => {
    const runtime = new FakePiRuntime();
    runtime.acquireLock('s1', 'a');
    expect(runtime.releaseLock('s1', 'b')).toBe(false);
    expect(runtime.releaseLock('s1', 'a')).toBe(true);
    expect(runtime.releaseLock('s1', 'a')).toBe(false);
  });

  it('abort emits run.aborted with the reason', async () => {
    const runtime = new FakePiRuntime();
    const events = collect(runtime, 's1');
    await runtime.abort('s1', 'user');
    const aborted = events.find((e) => e.type === 'run.aborted');
    expect(aborted).toBeDefined();
    expect(aborted?.payload).toEqual({ reason: 'user' });
  });

  it('steer and followUp emit queue.updated', async () => {
    const runtime = new FakePiRuntime();
    const events = collect(runtime, 's1');
    await runtime.steer('s1', 'stop doing X');
    await runtime.followUp('s1', 'also do Y');

    const queue = events.filter((e) => e.type === 'queue.updated');
    expect(queue).toHaveLength(2);
    expect(queue[0].payload).toEqual({ type: 'steer', text: 'stop doing X', pending: 1 });
    expect(queue[1].payload).toEqual({ type: 'follow_up', text: 'also do Y', pending: 1 });
  });

  it('subscribe isolates sessions', async () => {
    const runtime = new FakePiRuntime();
    const s1: RealtimeEventDraft[] = [];
    const s2: RealtimeEventDraft[] = [];
    const unsub1: RuntimeEventHandler = (e) => s1.push(e);
    const unsub2: RuntimeEventHandler = (e) => s2.push(e);
    runtime.subscribe('s1', unsub1);
    runtime.subscribe('s2', unsub2);

    await runtime.abort('s1', 'x');

    expect(s1.some((e) => e.type === 'run.aborted')).toBe(true);
    expect(s2).toHaveLength(0);
  });

  it('unsubscribe stops delivery', async () => {
    const runtime = new FakePiRuntime();
    const events: RealtimeEventDraft[] = [];
    const unsub = runtime.subscribe('s1', (e) => events.push(e));
    unsub();
    await runtime.abort('s1', 'x');
    expect(events).toHaveLength(0);
  });
});

describe('PiRuntimeAdapter', () => {
  it('inherits lock semantics from BaseRuntime (reentrant for same owner)', () => {
    const adapter = new PiRuntimeAdapter();
    expect(adapter.acquireLock('s1', 'a')).toBe(true);
    expect(adapter.acquireLock('s1', 'b')).toBe(false);
    expect(adapter.acquireLock('s1', 'a')).toBe(true);
    expect(adapter.releaseLock('s1', 'b')).toBe(false);
    expect(adapter.releaseLock('s1', 'a')).toBe(true);
    expect(adapter.releaseLock('s1', 'a')).toBe(false);
  });

  it('abort emits a local run.aborted envelope when no client is running', async () => {
    const adapter = new PiRuntimeAdapter();
    const events = collect(adapter, 's1');
    await adapter.abort('s1', 'user');
    const aborted = events.find((e) => e.type === 'run.aborted');
    expect(aborted).toBeDefined();
    expect(aborted?.payload).toEqual({ reason: 'user' });
  });

  it('unsubscribe stops delivery', async () => {
    const adapter = new PiRuntimeAdapter();
    const events: RealtimeEventDraft[] = [];
    const unsub = adapter.subscribe('s1', (e) => events.push(e));
    unsub();
    await adapter.abort('s1', 'x');
    expect(events).toHaveLength(0);
  });

  it('dispose stops all clients without throwing', async () => {
    const adapter = new PiRuntimeAdapter();
    await expect(adapter.dispose()).resolves.toBeUndefined();
  });
});

describe('createRuntime factory', () => {
  it('returns FakePiRuntime by default and PiRuntimeAdapter for pi', () => {
    expect(createRuntime()).toBeInstanceOf(FakePiRuntime);
    expect(createRuntime('fake')).toBeInstanceOf(FakePiRuntime);
    expect(createRuntime('pi')).toBeInstanceOf(PiRuntimeAdapter);
  });
});

describe('RuntimeManager', () => {
  class BlockingRuntime extends FakePiRuntime {
    private resolveStarted!: () => void;
    private resolvePrompt!: () => void;
    readonly promptStarted = new Promise<void>((resolve) => { this.resolveStarted = resolve; });
    private readonly promptGate = new Promise<void>((resolve) => { this.resolvePrompt = resolve; });

    override async prompt(): Promise<void> {
      this.resolveStarted();
      await this.promptGate;
    }

    finishPrompt(): void {
      this.resolvePrompt();
    }
  }

  class CapturingRuntime extends FakePiRuntime {
    lastInput: SendMessageInput | null = null;

    override async prompt(sessionId: string, input: SendMessageInput): Promise<void> {
      this.lastInput = input;
      await super.prompt(sessionId, input);
    }
  }

  class QueuedFollowUpRuntime extends FakePiRuntime {
    private resolveFirstPromptStarted!: () => void;
    private releaseFirstPrompt!: () => void;
    readonly firstPromptStarted = new Promise<void>((resolve) => { this.resolveFirstPromptStarted = resolve; });
    private readonly firstPromptGate = new Promise<void>((resolve) => { this.releaseFirstPrompt = resolve; });
    readonly inputs: SendMessageInput[] = [];

    override async prompt(sessionId: string, input: SendMessageInput): Promise<void> {
      this.inputs.push(input);
      if (this.inputs.length === 1) {
        this.resolveFirstPromptStarted();
        await this.firstPromptGate;
      }
      await super.prompt(sessionId, input);
    }

    finishFirstPrompt(): void {
      this.releaseFirstPrompt();
    }
  }

  class AuditedRuntime extends FakePiRuntime {
    getProcessInfo() {
      return { pid: 4321, command: '/usr/local/bin/pi', cwd: '/wt', sandboxed: false };
    }
  }

  function setup(runtime = new FakePiRuntime()) {
    const db: DatabaseSync = createDb(':memory:');
    const events = createEventsRepository(db);
    const eventStore = createEventStore(db);
    const tasks = createTasksRepository(db);
    const piSessions = createPiSessionsRepository(db);
    const manager = new RuntimeManager({ runtime, eventStore, tasks, piSessions });

    const project = db
      .prepare(
        `INSERT INTO projects (id, name, repo_path, default_branch, agents_dir, runtime_state_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'p1',
        'proj',
        '/r',
        'main',
        '.agents',
        '/var/lib/agents/projects/p1',
        new Date().toISOString(),
        new Date().toISOString(),
      );
    void project;

    const task = tasks.create({
      projectId: 'p1',
      title: 't',
      mode: 'implementation',
      status: 'idle',
      baseBranch: 'main',
      baseSha: 'sha',
      branchName: 'agents/task/t1',
      worktreePath: '/wt',
      piSessionPath: '/sess/task.jsonl',
      mergeTarget: 'main',
    });
    return { db, events, tasks, piSessions, runtime, manager, task };
  }

  it('runTask acquires lock, persists events, transitions idle -> running -> needs_review', async () => {
    const { manager, events, tasks, piSessions, task, runtime } = setup();
    await manager.runTask(
      { id: task.id, projectId: 'p1' },
      { text: 'do it', behavior: 'send' },
    );

    const persisted = events.listByTask(task.id);
    expect(persisted.length).toBeGreaterThan(0);
    const types = persisted.map((e: RealtimeEnvelope) => e.type);
    expect(types).toContain('run.started');
    expect(types).toContain('run.completed');

    const final = tasks.getById(task.id);
    expect(final?.status).toBe('needs_review');
    const session = piSessions.getByTaskId(task.id);
    expect(runtime.lastPreparedSession).toMatchObject({
      sessionId: session?.id,
      cwd: '/wt',
      sessionPath: '/sess/task.jsonl',
      resourceRoot: undefined,
      agentsDir: undefined,
    });
    expect(session).toMatchObject({ path: '/sess/task.jsonl', cwd: '/wt', lockOwner: null });

    expect(runtime.acquireLock(session!.id, 'runtime')).toBe(true);
    runtime.releaseLock(session!.id, 'runtime');
  });

  it('normalizes created and needs_review tasks through valid transitions before each run', async () => {
    const { manager, tasks, task } = setup();
    tasks.updateStatus(task.id, 'created');
    const updateStatus = vi.spyOn(tasks, 'updateStatus');

    await manager.runTask({ id: task.id, projectId: task.projectId }, baseInput);
    await manager.runTask({ id: task.id, projectId: task.projectId }, baseInput);

    expect(updateStatus.mock.calls.map(([, status]) => status)).toEqual([
      'idle', 'queued', 'running', 'needs_review',
      'idle', 'queued', 'running', 'needs_review',
    ]);
    expect(tasks.getById(task.id)?.status).toBe('needs_review');
  });

  it('records the lifecycle of a real runtime child process when audit metadata is available', async () => {
    const runtime = new AuditedRuntime();
    const { db, tasks, piSessions, task } = setup(runtime);
    const runtimeProcesses = createRuntimeProcessesRepository(db);
    const manager = new RuntimeManager({
      runtime,
      eventStore: createEventStore(db),
      tasks,
      piSessions,
      runtimeProcesses,
    });

    await manager.runTask({ id: task.id, projectId: task.projectId }, baseInput);

    expect(runtimeProcesses.listByTaskId(task.id)).toEqual([
      expect.objectContaining({
        piSessionId: piSessions.getByTaskId(task.id)?.id,
        pid: 4321,
        command: '/usr/local/bin/pi',
        cwd: '/wt',
        sandboxMode: 'none',
        status: 'completed',
        endedAt: expect.any(String),
      }),
    ]);
  });

  it('records the preceding task when a persistent Chat session changes worktree', async () => {
    const db = createDb(':memory:');
    const eventStore = createEventStore(db);
    const tasks = createTasksRepository(db);
    const chats = createChatsRepository(db);
    const piSessions = createPiSessionsRepository(db);
    const projects = createProjectsRepository(db);
    const project = projects.create({ name: 'p', repoPath: '/primary', defaultBranch: 'main', runtimeStatePath: '/runtime' });
    const previous = tasks.create({
      projectId: project.id, title: 'previous', mode: 'implementation', status: 'merged', baseBranch: 'main', baseSha: 'base',
      branchName: 'agents/previous', worktreePath: '/worktrees/previous', piSessionPath: '/runtime/sessions/chat.jsonl', mergeTarget: 'main',
    });
    const chat = chats.create({ projectId: project.id, title: 'chat', mode: 'implementation' });
    const current = tasks.create({
      projectId: project.id, sourceChatId: chat.id, title: 'current', mode: 'implementation', status: 'idle', baseBranch: 'main', baseSha: 'base',
      branchName: 'agents/current', worktreePath: '/worktrees/current', piSessionPath: '/runtime/sessions/chat.jsonl', mergeTarget: 'main',
    });
    const session = piSessions.create({
      projectId: project.id, chatId: chat.id, path: '/runtime/sessions/chat.jsonl', cwd: previous.worktreePath,
    });
    chats.update(chat.id, { activeTaskId: current.id, piSessionId: session.id, activePiSessionId: session.id });
    tasks.update(current.id, { piSessionId: session.id });
    const manager = new RuntimeManager({ runtime: new FakePiRuntime(), eventStore, tasks, chats, piSessions, projects });

    await manager.runTask({ id: current.id, projectId: project.id, chatId: chat.id }, baseInput);

    const marker = eventStore.stream('chat', chat.id).find((event) => event.type === 'workspace_context_changed');
    expect(marker?.payload).toMatchObject({
      previousTaskId: previous.id,
      newTaskId: current.id,
      previousCwd: previous.worktreePath,
      newCwd: current.worktreePath,
    });
  });

  it('heartbeats the persistent lock with its unique runtime owner until the run ends', async () => {
    const db: DatabaseSync = createDb(':memory:');
    const eventStore = createEventStore(db);
    const tasks = createTasksRepository(db);
    const piSessions = createPiSessionsRepository(db);
    const runtime = new BlockingRuntime();
    db.prepare(
      `INSERT INTO projects (id, name, repo_path, default_branch, agents_dir, runtime_state_path, created_at, updated_at)
       VALUES ('p1', 'proj', '/r', 'main', '.agents', '/runtime', ?, ?)`,
    ).run(new Date().toISOString(), new Date().toISOString());
    const task = tasks.create({
      projectId: 'p1', title: 't', mode: 'implementation', status: 'idle', baseBranch: 'main', baseSha: 'sha',
      branchName: 'agents/task/t1', worktreePath: '/wt', piSessionPath: '/sessions/t1.jsonl', mergeTarget: 'main',
    });
    const heartbeat = vi.spyOn(piSessions, 'heartbeatLock');
    const manager = new RuntimeManager({
      runtime,
      eventStore,
      tasks,
      piSessions,
      lockOwner: 'api-instance-a',
      lockHeartbeatMs: 5,
    });

    const run = manager.runTask({ id: task.id, projectId: task.projectId }, baseInput);
    await runtime.promptStarted;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heartbeat).toHaveBeenCalledWith(expect.any(String), 'api-instance-a');

    runtime.finishPrompt();
    await run;
    expect(piSessions.getByTaskId(task.id)).toMatchObject({ lockOwner: null, lockHeartbeatAt: null });
  });

  it('aborts a timed-out run and keeps its task paused instead of resetting its worktree', async () => {
    const runtime = new BlockingRuntime();
    const { db, tasks, piSessions, task } = setup(runtime);
    const manager = new RuntimeManager({
      runtime,
      eventStore: createEventStore(db),
      tasks,
      piSessions,
      runTimeoutMs: 10,
    });

    await manager.runTask({ id: task.id, projectId: task.projectId }, baseInput);

    expect(tasks.getById(task.id)?.status).toBe('paused_dirty');
  });

  it('keeps a manually aborted task paused when Pi ends the RPC turn cleanly', async () => {
    const runtime = new BlockingRuntime();
    const { manager, tasks, task } = setup(runtime);
    const run = manager.runTask({ id: task.id, projectId: task.projectId }, baseInput);
    await runtime.promptStarted;

    await manager.abort(task.id, 'user');
    runtime.finishPrompt();
    await run;

    expect(tasks.getById(task.id)?.status).toBe('paused_dirty');
  });

  it('runTask throws when the lock is already held by another owner', async () => {
    const { manager, runtime, task, piSessions, tasks } = setup();
    const session = piSessions.create({ projectId: task.projectId, taskId: task.id, path: task.piSessionPath, cwd: task.worktreePath });
    tasks.update(task.id, { piSessionId: session.id });
    expect(runtime.acquireLock(session.id, 'someone-else')).toBe(true);
    await expect(
      manager.runTask({ id: task.id, projectId: 'p1' }, baseInput),
    ).rejects.toThrow(/writer runtime/);
    runtime.releaseLock(session.id, 'someone-else');
  });

  it('rejects task commands when no run owns a Pi process', async () => {
    const { manager, task } = setup();
    await expect(manager.steer(task.id, 'focus')).rejects.toThrow('Task is not running');
    await expect(manager.followUp(task.id, 'continue')).rejects.toThrow('Task is not running');
    await expect(manager.abort(task.id, 'user')).rejects.toThrow('Task is not running');
  });

  it('runs each follow-up as the next discrete Pi step and delivers its queue item after success', async () => {
    const runtime = new QueuedFollowUpRuntime();
    const { db, tasks, piSessions, task } = setup(runtime);
    const chats = createChatsRepository(db);
    const chat = chats.create({ projectId: task.projectId, title: 'task chat', mode: 'implementation', activeTaskId: task.id });
    const session = piSessions.create({ projectId: task.projectId, chatId: chat.id, path: task.piSessionPath, cwd: task.worktreePath });
    chats.update(chat.id, { piSessionId: session.id, activePiSessionId: session.id });
    tasks.update(task.id, { sourceChatId: chat.id, piSessionId: session.id });
    const queue = createQueuedMessagesRepository(db);
    const manager = new RuntimeManager({
      runtime,
      eventStore: createEventStore(db),
      tasks,
      chats,
      piSessions,
      queuedMessages: queue,
    });

    const run = manager.runTask({ id: task.id, projectId: task.projectId, chatId: chat.id }, baseInput);
    await runtime.firstPromptStarted;
    await manager.followUp(task.id, 'continue after this step');
    expect(queue.listPending(chat.id)).toHaveLength(1);

    runtime.finishFirstPrompt();
    await run;

    expect(runtime.inputs.map((input) => input.text)).toEqual([baseInput.text, 'continue after this step']);
    expect(queue.listPending(chat.id)).toHaveLength(0);
    expect(db.prepare('SELECT status FROM queued_messages').get()).toEqual({ status: 'delivered' });
    expect(tasks.getById(task.id)?.status).toBe('needs_review');
  });

  it('marks interrupted runs paused_after_restart during backend recovery and persists the reason', async () => {
    const { manager, events, tasks, task, piSessions } = setup();
    tasks.updateStatus(task.id, 'running');
    const session = piSessions.create({ projectId: task.projectId, taskId: task.id, path: task.piSessionPath, cwd: task.worktreePath });
    expect(piSessions.acquireLock(session.id, 'runtime')).toBe(true);

    expect(await manager.recoverInterruptedRuns()).toBe(1);
    expect(tasks.getById(task.id)?.status).toBe('paused_after_restart');
    expect(piSessions.getById(session.id)?.lockOwner).toBeNull();
    expect(events.listByTask(task.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(['run.aborted', 'task.status.changed']),
    );
  });

  it('keeps pending follow-ups after a backend restart', async () => {
    const { db, tasks, task, piSessions } = setup();
    const chats = createChatsRepository(db);
    const chat = chats.create({ projectId: task.projectId, title: 'task chat', mode: 'implementation', activeTaskId: task.id });
    const session = piSessions.create({ projectId: task.projectId, chatId: chat.id, path: task.piSessionPath, cwd: task.worktreePath });
    chats.update(chat.id, { piSessionId: session.id, activePiSessionId: session.id });
    tasks.update(task.id, { piSessionId: session.id });
    tasks.updateStatus(task.id, 'running');
    const queue = createQueuedMessagesRepository(db);
    queue.enqueue({ chatId: chat.id, taskId: task.id, text: 'continue after current step' });

    const manager = new RuntimeManager({
      runtime: new FakePiRuntime(),
      eventStore: createEventStore(db),
      tasks,
      chats,
      piSessions,
      queuedMessages: queue,
    });
    expect(await manager.recoverInterruptedRuns()).toBe(1);
    expect(tasks.getById(task.id)?.status).toBe('paused_after_restart');
    expect(queue.listPending(chat.id).map((item) => item.text)).toEqual(['continue after current step']);
  });

  it('adds recovery instructions before resuming a paused task', async () => {
    const runtime = new CapturingRuntime();
    const { manager, tasks, task } = setup(runtime);
    tasks.updateStatus(task.id, 'paused_after_restart');

    await manager.runTask({ id: task.id, projectId: task.projectId }, {
      text: 'continue the implementation',
      behavior: 'send',
    });

    expect(runtime.lastInput?.text).toContain('The previous agent run was interrupted');
    expect(runtime.lastInput?.text).toContain('git status');
    expect(runtime.lastInput?.text).toContain('continue the implementation');
  });

  it('runs a discussion through the Chat PiSession in the primary repository with read-only tools', async () => {
    const db: DatabaseSync = createDb(':memory:');
    const eventStore = createEventStore(db);
    const tasks = createTasksRepository(db);
    const chats = createChatsRepository(db);
    const piSessions = createPiSessionsRepository(db);
    const projects = createProjectsRepository(db);
    const project = projects.create({
      name: 'primary', repoPath: '/primary-repo', defaultBranch: 'main', runtimeStatePath: '/runtime',
    });
    const chat = chats.create({ projectId: project.id, title: 'discussion', mode: 'discussion' });
    const session = piSessions.create({
      projectId: project.id,
      chatId: chat.id,
      path: '/runtime/sessions/chat.jsonl',
      cwd: project.repoPath,
    });
    chats.update(chat.id, { piSessionId: session.id, activePiSessionId: session.id });
    const runtime = new FakePiRuntime();
    const manager = new RuntimeManager({ runtime, eventStore, tasks, chats, piSessions, projects });

    await manager.runChat({ id: chat.id, projectId: project.id }, { text: 'review this repository', behavior: 'send' });

    expect(runtime.lastPreparedSession).toEqual({
      sessionId: session.id,
      cwd: project.repoPath,
      sessionPath: session.path,
      resourceRoot: project.repoPath,
      agentsDir: '.agents',
      allowedTools: ['read', 'grep', 'find', 'ls'],
    });
    expect(eventStore.stream('chat', chat.id).map((event) => event.type)).toContain('run.completed');
  });

  it('aborts the active run before replacing it in the same task session', async () => {
    const { manager, events, tasks, task } = setup();
    const first = manager.runTask({ id: task.id, projectId: 'p1' }, { text: 'first', behavior: 'send' });

    await manager.abortAndReplace(
      { id: task.id, projectId: 'p1' },
      { text: 'replacement', behavior: 'abort_and_replace' },
    );
    await first;

    const types = events.listByTask(task.id).map((event) => event.type);
    expect(types.filter((type) => type === 'run.started')).toHaveLength(2);
    expect(types).toContain('run.aborted');
    expect(tasks.getById(task.id)?.status).toBe('needs_review');
  });
});
