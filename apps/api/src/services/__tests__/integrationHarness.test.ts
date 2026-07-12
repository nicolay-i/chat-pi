import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { PiRpcClient } from '../piRpcClient';
import { FakePiRuntime } from '../piRuntimeService';
import { RuntimeManager } from '../runtimeManager';
import { createDb } from '../../db';
import { createProjectsRepository } from '../../db/repositories/projectsRepository';
import { createTasksRepository } from '../../db/repositories/tasksRepository';
import { createPiSessionsRepository } from '../../db/repositories/piSessionsRepository';
import { createEventStore } from '../../realtime/eventStore';
import { TemporaryGitRepository } from '../../test/harness/TemporaryGitRepository';
import { FakePiRpcProcess } from '../../test/harness/FakePiRpcProcess';

describe('integration harness', () => {
  it('creates isolated worktrees and exposes a real rebase conflict', () => {
    const repo = new TemporaryGitRepository();
    try {
      const first = repo.createWorktree('first');
      const second = repo.createWorktree('second');
      repo.changeAndCommit(first, 'first\n', 'first changes shared file');
      repo.changeAndCommit(second, 'second\n', 'second changes shared file');
      repo.advanceMain('main\n');

      expect(repo.rebase(first).ok).toBe(false);
      expect(repo.rebase(second).ok).toBe(false);
    } finally {
      repo.dispose();
    }
  });

  it('drives a child JSONL RPC process through prompt, commands and session recovery', async () => {
    const repo = new TemporaryGitRepository();
    const worktree = repo.createWorktree('agent');
    const sessionPath = join(repo.runtimePath, 'sessions', 'agent.jsonl');
    const client = new PiRpcClient(FakePiRpcProcess.options({ cwd: worktree, sessionPath }));
    const events: Record<string, unknown>[] = [];
    const unsubscribe = client.onEvent((event) => events.push(event));
    try {
      await client.start();
      const state = await client.getState() as { cwd: string; sessionPath: string };
      expect(state.cwd).toBe(worktree);
      expect(state.sessionPath).toBe(sessionPath);

      await client.prompt('implement fixture');
      await client.waitForIdle(2_000);
      await client.steer('focus');
      await client.followUp('continue');
      await expect(client.send({ type: 'fail' })).rejects.toThrow('fake runtime failure');
      expect(events.map((event) => event.type)).toContain('tool_result');
      await client.stop();

      const recovered = new PiRpcClient(FakePiRpcProcess.options({ cwd: worktree, sessionPath }));
      try {
        await recovered.start();
        expect((await recovered.getState() as { sessionPath: string }).sessionPath).toBe(sessionPath);
      } finally {
        await recovered.stop();
      }
    } finally {
      unsubscribe();
      await client.stop();
      repo.dispose();
    }
  });

  it('runs two tasks concurrently without sharing worktrees or Pi sessions', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(':memory:');
    class TrackingRuntime extends FakePiRuntime {
      readonly prepared: Array<{ sessionId: string; cwd: string; sessionPath: string }> = [];
      override async prepare(session: { sessionId: string; cwd: string; sessionPath: string }): Promise<void> {
        this.prepared.push(session);
        await super.prepare(session);
      }
    }
    try {
      const project = createProjectsRepository(db).create({ name: 'parallel', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath });
      const tasks = createTasksRepository(db);
      const firstWorktree = repo.createWorktree('parallel-first');
      const secondWorktree = repo.createWorktree('parallel-second');
      const first = tasks.create({ projectId: project.id, title: 'first', mode: 'implementation', status: 'idle', baseBranch: 'main', baseSha: repo.mainHead, branchName: 'agents/parallel-first', worktreePath: firstWorktree, piSessionPath: join(repo.runtimePath, 'sessions', 'first.jsonl'), mergeTarget: 'main' });
      const second = tasks.create({ projectId: project.id, title: 'second', mode: 'implementation', status: 'idle', baseBranch: 'main', baseSha: repo.mainHead, branchName: 'agents/parallel-second', worktreePath: secondWorktree, piSessionPath: join(repo.runtimePath, 'sessions', 'second.jsonl'), mergeTarget: 'main' });
      const runtime = new TrackingRuntime();
      const manager = new RuntimeManager({ runtime, eventStore: createEventStore(db), tasks, piSessions: createPiSessionsRepository(db) });
      await Promise.all([
        manager.runTask({ id: first.id, projectId: project.id }, { text: 'first task', behavior: 'send' }),
        manager.runTask({ id: second.id, projectId: project.id }, { text: 'second task', behavior: 'send' }),
      ]);
      expect(runtime.prepared).toEqual(expect.arrayContaining([
        expect.objectContaining({ sessionId: first.id, cwd: firstWorktree, sessionPath: first.piSessionPath }),
        expect.objectContaining({ sessionId: second.id, cwd: secondWorktree, sessionPath: second.piSessionPath }),
      ]));
      expect(createPiSessionsRepository(db).getByTaskId(first.id)?.path).not.toBe(createPiSessionsRepository(db).getByTaskId(second.id)?.path);
      expect(tasks.getById(first.id)?.worktreePath).not.toBe(tasks.getById(second.id)?.worktreePath);
    } finally { repo.dispose(); }
  });

  it('recovers an interrupted task after a simulated backend restart and releases its persistent lock', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(':memory:');
    try {
      const project = createProjectsRepository(db).create({ name: 'recovery', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath });
      const tasks = createTasksRepository(db);
      const worktree = repo.createWorktree('recovery');
      const task = tasks.create({ projectId: project.id, title: 'recover', mode: 'implementation', status: 'running', baseBranch: 'main', baseSha: repo.mainHead, branchName: 'agents/recovery', worktreePath: worktree, piSessionPath: join(repo.runtimePath, 'sessions', 'recovery.jsonl'), mergeTarget: 'main' });
      const sessions = createPiSessionsRepository(db);
      const session = sessions.create({ projectId: project.id, taskId: task.id, path: task.piSessionPath, cwd: task.worktreePath });
      expect(sessions.acquireLock(session.id, 'runtime')).toBe(true);
      const recoveredManager = new RuntimeManager({ runtime: new FakePiRuntime(), eventStore: createEventStore(db), tasks, piSessions: sessions });
      expect(await recoveredManager.recoverInterruptedRuns()).toBe(1);
      expect(tasks.getById(task.id)?.status).toBe('failed');
      expect(sessions.getById(session.id)?.lockOwner).toBeNull();
    } finally { repo.dispose(); }
  });
});
