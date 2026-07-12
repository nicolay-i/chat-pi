import { describe, it, expect, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
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
import { createPiSessionsRepository } from '../../db/repositories/piSessionsRepository';
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
  it('streams a complete agent turn through a persistent task session', async () => {
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

  function setup() {
    const db: DatabaseSync = createDb(':memory:');
    const events = createEventsRepository(db);
    const eventStore = createEventStore(db);
    const tasks = createTasksRepository(db);
    const piSessions = createPiSessionsRepository(db);
    const runtime = new FakePiRuntime();
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
    expect(runtime.lastPreparedSession).toEqual({
      sessionId: task.id,
      cwd: '/wt',
      sessionPath: '/sess/task.jsonl',
      resourceRoot: undefined,
      agentsDir: undefined,
    });
    expect(piSessions.getByTaskId(task.id)).toMatchObject({ path: '/sess/task.jsonl', cwd: '/wt', lockOwner: null });

    expect(runtime.acquireLock(task.id, 'runtime')).toBe(true);
    runtime.releaseLock(task.id, 'runtime');
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

  it('runTask throws when the lock is already held by another owner', async () => {
    const { manager, runtime, task } = setup();
    expect(runtime.acquireLock(task.id, 'someone-else')).toBe(true);
    await expect(
      manager.runTask({ id: task.id, projectId: 'p1' }, baseInput),
    ).rejects.toThrow(/Task already running/);
    runtime.releaseLock(task.id, 'someone-else');
  });

  it('rejects task commands when no run owns a Pi process', async () => {
    const { manager, task } = setup();
    await expect(manager.steer(task.id, 'focus')).rejects.toThrow('Task is not running');
    await expect(manager.followUp(task.id, 'continue')).rejects.toThrow('Task is not running');
    await expect(manager.abort(task.id, 'user')).rejects.toThrow('Task is not running');
  });

  it('marks interrupted runs failed during backend recovery and persists the reason', async () => {
    const { manager, events, tasks, task, piSessions } = setup();
    tasks.updateStatus(task.id, 'running');
    const session = piSessions.create({ projectId: task.projectId, taskId: task.id, path: task.piSessionPath, cwd: task.worktreePath });
    expect(piSessions.acquireLock(session.id, 'runtime')).toBe(true);

    expect(await manager.recoverInterruptedRuns()).toBe(1);
    expect(tasks.getById(task.id)?.status).toBe('failed');
    expect(piSessions.getById(session.id)?.lockOwner).toBeNull();
    expect(events.listByTask(task.id).map((event) => event.type)).toEqual(
      expect.arrayContaining(['run.error', 'task.status.changed']),
    );
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
