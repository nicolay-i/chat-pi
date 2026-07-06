import { describe, it, expect } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
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
import { createTasksRepository } from '../../db/repositories/tasksRepository';

function collect(runtime: PiRuntime, sessionId: string): RealtimeEnvelope[] {
  const events: RealtimeEnvelope[] = [];
  runtime.subscribe(sessionId, (e) => events.push(e));
  return events;
}

const baseInput: SendMessageInput = {
  text: 'hello',
  behavior: 'send',
};

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
    expect(queue[0].payload).toEqual({ type: 'steer', text: 'stop doing X' });
    expect(queue[1].payload).toEqual({ type: 'follow_up', text: 'also do Y' });
  });

  it('subscribe isolates sessions', async () => {
    const runtime = new FakePiRuntime();
    const s1: RealtimeEnvelope[] = [];
    const s2: RealtimeEnvelope[] = [];
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
    const events: RealtimeEnvelope[] = [];
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
    const events: RealtimeEnvelope[] = [];
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
  function setup() {
    const db: DatabaseSync = createDb(':memory:');
    const events = createEventsRepository(db);
    const tasks = createTasksRepository(db);
    const runtime = new FakePiRuntime();
    const manager = new RuntimeManager({ runtime, events, tasks });

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
      piSessionPath: '/sess',
      mergeTarget: 'main',
    });
    return { db, events, tasks, runtime, manager, task };
  }

  it('runTask acquires lock, persists events, transitions idle -> running -> needs_review', async () => {
    const { manager, events, tasks, task, runtime } = setup();
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

    expect(runtime.acquireLock(task.id, 'runtime')).toBe(true);
    runtime.releaseLock(task.id, 'runtime');
  });

  it('runTask throws when the lock is already held by another owner', async () => {
    const { manager, runtime, task } = setup();
    expect(runtime.acquireLock(task.id, 'someone-else')).toBe(true);
    await expect(
      manager.runTask({ id: task.id, projectId: 'p1' }, baseInput),
    ).rejects.toThrow(/Task already running/);
    runtime.releaseLock(task.id, 'someone-else');
  });
});
