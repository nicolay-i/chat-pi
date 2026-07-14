import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { DatabaseSync } from 'node:sqlite';

import { createDb, migrate } from '../../db';
import { createTasksRepository, createProjectsRepository } from '../../db';
import { createChatsRepository } from '../../db/repositories/chatsRepository';
import { createQueuedMessagesRepository } from '../../db/repositories/queuedMessagesRepository';
import { createPiSessionsRepository } from '../../db/repositories/piSessionsRepository';
import { createCheckpointsRepository } from '../../db/repositories/checkpointsRepository';
import { createEventStore } from '../../realtime/eventStore';
import { GitWorktreeService } from '../gitWorktreeService';
import { createCheckpointService } from '../checkpointService';
import { createForkService } from '../forkService';
import { createRollbackService } from '../rollbackService';
import { createMergeService } from '../mergeService';
import { createGitTaskService } from '../gitTaskService';
import { createTaskCancellationService } from '../taskCancellationService';
import { createProjectRemoteSyncService } from '../projectRemoteSyncService';
import { isValidStatusTransition } from '../taskStatus';

function git(cwd: string, args: string[]): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) {
    throw new Error(
      `git ${args.join(' ')} failed in ${cwd}: ${(r.stderr ?? '').trim() || r.error?.message}`,
    );
  }
  return (r.stdout ?? '').trim();
}

function toPosix(p: string): string {
  return p.split('\\').join('/');
}

type TempRepo = { repoPath: string; runtimePath: string; mainHead: string };

function makeTempRepo(): TempRepo {
  const root = mkdtempSync(join(tmpdir(), 'pi-flows-'));
  const repoPath = join(root, 'repo');
  const runtimePath = join(root, 'runtime');
  mkdirSync(repoPath, { recursive: true });
  mkdirSync(runtimePath, { recursive: true });
  git(repoPath, ['init', '-b', 'main']);
  git(repoPath, ['config', 'user.name', 'Pi Test']);
  git(repoPath, ['config', 'user.email', 'pi@test.local']);
  writeFileSync(join(repoPath, 'README.md'), '# demo\n');
  git(repoPath, ['add', 'README.md']);
  git(repoPath, ['commit', '-m', 'init']);
  const mainHead = git(repoPath, ['rev-parse', 'HEAD']);
  return { repoPath, runtimePath, mainHead };
}

function makeTempRuntime(): string {
  return mkdtempSync(join(tmpdir(), 'pi-rt-'));
}

type Env = {
  db: DatabaseSync;
  tasks: ReturnType<typeof createTasksRepository>;
  projects: ReturnType<typeof createProjectsRepository>;
  checkpoints: ReturnType<typeof createCheckpointsRepository>;
  events: ReturnType<typeof createEventStore>;
  worktree: GitWorktreeService;
};

function makeEnv(): Env {
  const db: DatabaseSync = createDb(':memory:');
  migrate(db);
  const tasks = createTasksRepository(db);
  const projects = createProjectsRepository(db);
  const checkpoints = createCheckpointsRepository(db);
  const events = createEventStore(db);
  const worktree = new GitWorktreeService();
  return { db, tasks, projects, checkpoints, events, worktree };
}

function seedProject(env: Env, repoPath: string, runtimePath: string): string {
  const rec = env.projects.create({
    name: 'demo',
    repoPath,
    defaultBranch: 'main',
    runtimeStatePath: runtimePath,
  });
  return rec.id;
}

type SeedTaskInput = {
  env: Env;
  projectId: string;
  taskId: string;
  repoPath: string;
  runtimePath: string;
  title?: string;
};

async function seedTask(input: SeedTaskInput): Promise<{
  taskId: string;
  branchName: string;
  worktreePath: string;
  baseSha: string;
}> {
  const { env, projectId, taskId, repoPath, runtimePath } = input;
  const ref = await env.worktree.createTaskWorktree({
    repoPath,
    taskId,
    baseBranch: 'main',
    runtimePath,
  });
  env.tasks.create({
    id: taskId,
    projectId,
    title: input.title ?? `task ${taskId}`,
    mode: 'implementation',
    status: 'created',
    baseBranch: 'main',
    baseSha: ref.baseSha,
    branchName: ref.branchName,
    worktreePath: ref.worktreePath,
    piSessionPath: join(runtimePath, 'sessions', taskId),
    mergeTarget: 'main',
  });
  return { taskId, branchName: ref.branchName, worktreePath: ref.worktreePath, baseSha: ref.baseSha };
}

function moveStatus(env: Env, taskId: string, target: 'idle' | 'running'): void {
  const paths: Record<string, string[]> = {
    idle: ['idle'],
    running: ['idle', 'queued', 'running'],
  };
  for (const step of paths[target]) {
    const cur = env.tasks.getById(taskId);
    if (cur && isValidStatusTransition(cur.status, step as never)) {
      env.tasks.updateStatus(taskId, step as never);
    }
  }
}

describe('git flows: checkpoint / fork / rollback / merge (real git)', () => {
  let repo: TempRepo;
  let env: Env;

  beforeEach(() => {
    repo = makeTempRepo();
    env = makeEnv();
  });

  afterEach(() => {
    if (repo) cleanup(join(repo.repoPath, '..'));
  });

  function cleanup(path: string): void {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  }

  it('checkpoint creates a commit and a patch file', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-cp-1';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });

    writeFileSync(join(seed.worktreePath, 'file.txt'), 'hello\n');

    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    const cp = await checkpointService.createCheckpoint({
      taskId,
      message: 'add file.txt',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });

    expect(cp.sha).toBeTruthy();
    expect(cp.sha).not.toBe(seed.baseSha);
    expect(cp.message).toBe('add file.txt');
    expect(cp.taskId).toBe(taskId);

    const log = git(seed.worktreePath, ['log', '--oneline', '-1']);
    expect(log.toLowerCase()).toContain('add file.txt');

    const row = env.db
      .prepare('SELECT patch_path FROM task_checkpoints WHERE task_id = ?')
      .get(taskId) as { patch_path: string } | undefined;
    expect(row?.patch_path).toBeTruthy();
    expect(existsSync(row!.patch_path)).toBe(true);
    expect(row!.patch_path.startsWith(join(repo.runtimePath, 'checkpoints', taskId))).toBe(true);
    expect(row!.patch_path.startsWith(seed.worktreePath)).toBe(false);
    expect(readFileSync(row!.patch_path, 'utf8')).toContain('file.txt');
    expect(git(seed.worktreePath, ['status', '--porcelain'])).toBe('');

    const list = env.checkpoints.listByTask(taskId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(cp.id);

    const taskAfter = env.tasks.getById(taskId);
    expect(taskAfter?.currentHeadSha).toBe(cp.sha);
    expect(cp.hasFileChanges).toBe(true);
    expect(cp.beforeSha).toBe(seed.baseSha);
    expect(cp.afterSha).toBe(cp.sha);
  });

  it('creates a stable checkpoint without an empty Git commit when files are unchanged', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-cp-clean';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    const beforeLogCount = git(seed.worktreePath, ['rev-list', '--count', 'HEAD']);
    const cp = await checkpointService.createCheckpoint({
      taskId,
      message: 'discussion only',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });

    expect(cp.hasFileChanges).toBe(false);
    expect(cp.changedFiles).toBe(0);
    expect(cp.beforeSha).toBe(seed.baseSha);
    expect(cp.afterSha).toBe(seed.baseSha);
    expect(cp.patchPath).toBeNull();
    expect(git(seed.worktreePath, ['rev-list', '--count', 'HEAD'])).toBe(beforeLogCount);
    expect(git(seed.worktreePath, ['status', '--porcelain'])).toBe('');
  });

  it('fork creates a new branch + worktree from the checkpoint sha', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-fork-1';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });

    writeFileSync(join(seed.worktreePath, 'a.txt'), 'A\n');

    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    const cp = await checkpointService.createCheckpoint({
      taskId,
      message: 'work before fork',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });

    const forkService = createForkService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    const newTaskId = 'task-fork-dest';
    const result = await forkService.forkFromCheckpoint({
      taskId,
      checkpointId: cp.id,
      newTaskId,
      repoPath: repo.repoPath,
      runtimePath: repo.runtimePath,
    });

    expect(result.task.id).toBe(newTaskId);
    expect(result.worktree.branchName).toBe(`agents/task/${newTaskId}`);
    expect(existsSync(result.worktree.worktreePath)).toBe(true);

    const branches = git(repo.repoPath, ['branch', '--list', `agents/task/${newTaskId}`]);
    expect(branches).toContain(`agents/task/${newTaskId}`);

    const newHead = git(result.worktree.worktreePath, ['rev-parse', 'HEAD']);
    expect(newHead).toBe(cp.sha);

    expect(existsSync(join(result.worktree.worktreePath, 'a.txt'))).toBe(true);

    const newTask = env.tasks.getById(newTaskId);
    expect(newTask).toBeTruthy();
    expect(newTask!.baseSha).toBe(cp.sha);
    expect(newTask!.status).toBe('created');
  });

  it('rollback creates a new task and archives the original', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-rb-1';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'idle');

    writeFileSync(join(seed.worktreePath, 'rb.txt'), 'RB\n');

    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    const cp = await checkpointService.createCheckpoint({
      taskId,
      message: 'before rollback',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });

    const forkService = createForkService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    const rollbackService = createRollbackService(env.db, {
      forkService,
      events: env.events,
      tasks: env.tasks,
    });

    const result = await rollbackService.rollbackToCheckpoint({
      taskId,
      checkpointId: cp.id,
      repoPath: repo.repoPath,
      runtimePath: repo.runtimePath,
    });

    expect(result.newTaskId).toBeTruthy();
    expect(result.newTaskId).not.toBe(taskId);

    const original = env.tasks.getById(taskId);
    expect(original?.status).toBe('archived');

    const newTask = env.tasks.getById(result.newTaskId);
    expect(newTask).toBeTruthy();
    expect(newTask!.baseSha).toBe(cp.sha);

    const originalBranch = git(repo.repoPath, ['branch', '--list', seed.branchName]);
    expect(originalBranch).toContain(seed.branchName);
  });

  it('rollback preserves the Chat PiSession while creating an isolated worktree from its checkpoint', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-rb-shared-session';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'idle');
    const chats = createChatsRepository(env.db);
    const chat = chats.create({ projectId, title: 'rollback chat', mode: 'implementation', activeTaskId: taskId });
    const sessions = createPiSessionsRepository(env.db);
    const session = sessions.create({
      projectId,
      chatId: chat.id,
      path: join(repo.runtimePath, 'sessions', `${chat.id}.jsonl`),
      cwd: seed.worktreePath,
    });
    chats.update(chat.id, { piSessionId: session.id, activePiSessionId: session.id });
    env.tasks.update(taskId, { sourceChatId: chat.id, piSessionId: session.id, piSessionPath: session.path });
    mkdirSync(dirname(session.path), { recursive: true });
    writeFileSync(session.path, [
      JSON.stringify({ type: 'session', version: 3, id: 'source-session', timestamp: '2026-07-12T00:00:00.000Z', cwd: seed.worktreePath }),
      JSON.stringify({ type: 'message', id: 'entry-c1', parentId: null, timestamp: '2026-07-12T00:00:01.000Z', message: { role: 'user', content: 'first step' } }),
      JSON.stringify({ type: 'message', id: 'entry-c2', parentId: 'entry-c1', timestamp: '2026-07-12T00:00:02.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'checkpoint answer' }] } }),
      JSON.stringify({ type: 'message', id: 'entry-after', parentId: 'entry-c2', timestamp: '2026-07-12T00:00:03.000Z', message: { role: 'user', content: 'later branch' } }),
    ].join('\n'), 'utf8');

    writeFileSync(join(seed.worktreePath, 'checkpoint.txt'), 'checkpoint state\n');
    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    const checkpoint = await checkpointService.createCheckpoint({
      taskId,
      chatId: chat.id,
      runId: 'run-rb',
      piSessionId: session.id,
      piEntryId: 'entry-c2',
      message: 'checkpoint C2',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });
    writeFileSync(join(seed.worktreePath, 'after-checkpoint.txt'), 'must remain only in task A\n');

    const forkService = createForkService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    const rollbackService = createRollbackService(env.db, {
      forkService,
      events: env.events,
      tasks: env.tasks,
      chats,
      piSessions: sessions,
    });
    const result = await rollbackService.rollbackToCheckpoint({
      taskId,
      checkpointId: checkpoint.id,
      repoPath: repo.repoPath,
      runtimePath: repo.runtimePath,
    });

    const rolledBack = env.tasks.getById(result.newTaskId)!;
    expect(rolledBack.sourceChatId).toBe(chat.id);
    expect(rolledBack.piSessionId).toBe(session.id);
    expect(rolledBack.piSessionPath).not.toBe(session.path);
    expect(rolledBack.baseSha).toBe(checkpoint.afterSha);
    expect(rolledBack.worktreePath).not.toBe(seed.worktreePath);
    expect(existsSync(join(rolledBack.worktreePath, 'checkpoint.txt'))).toBe(true);
    expect(existsSync(join(rolledBack.worktreePath, 'after-checkpoint.txt'))).toBe(false);
    expect(existsSync(join(seed.worktreePath, 'after-checkpoint.txt'))).toBe(true);
    expect(chats.getById(chat.id)).toMatchObject({ activeTaskId: result.newTaskId, activeLeafEntryId: 'entry-c2' });
    expect(sessions.getById(session.id)).toMatchObject({ path: rolledBack.piSessionPath, activeLeafEntryId: 'entry-c2' });
    const branchLines = readFileSync(rolledBack.piSessionPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(branchLines.map((entry: { id?: string }) => entry.id)).toEqual(expect.arrayContaining(['entry-c1', 'entry-c2']));
    expect(branchLines.some((entry: { id?: string }) => entry.id === 'entry-after')).toBe(false);
    expect(branchLines[0].id).not.toBe('source-session');
    expect(branchLines[0].cwd).toBe(rolledBack.worktreePath);
  });

  it('squash merge advances main and marks task merged', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-mg-1';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    const sibling = await seedTask({ env, projectId, taskId: 'task-mg-stale', repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'idle');
    moveStatus(env, sibling.taskId, 'idle');

    writeFileSync(join(seed.worktreePath, 'feature.txt'), 'FEATURE\n');

    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    await checkpointService.createCheckpoint({
      taskId,
      message: 'feature work',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });

    const mergeService = createMergeService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    const result = await mergeService.mergeTask({
      taskId,
      strategy: 'squash',
      commitMessage: 'agent: squash feature',
      repoPath: repo.repoPath,
    });

    expect(result.mergedSha).toBeTruthy();
    expect(result.mergedSha).not.toBe(repo.mainHead);

    const mainLog = git(repo.repoPath, ['log', '--oneline', '-1']);
    expect(mainLog.toLowerCase()).toContain('squash feature');

    const onMain = git(repo.repoPath, ['rev-parse', 'HEAD']);
    expect(onMain).toBe(result.mergedSha);

    const taskAfter = env.tasks.getById(taskId);
    expect(taskAfter?.status).toBe('merged');
    expect(env.tasks.getById(sibling.taskId)?.status).toBe('stale');
    expect(git(repo.repoPath, ['status', '--porcelain'])).toBe('');
    expect(existsSync(join(repo.runtimePath, 'integration', taskId))).toBe(false);
  }, 15_000);

  it('archives or discards a stopped task only through an explicit cancellation mode', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const archived = await seedTask({ env, projectId, taskId: 'task-cancel-archive', repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    const discarded = await seedTask({ env, projectId, taskId: 'task-cancel-discard', repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    const chats = createChatsRepository(env.db);
    const chat = chats.create({ projectId, title: 'cancel', mode: 'implementation', activeTaskId: archived.taskId });
    env.tasks.update(archived.taskId, { sourceChatId: chat.id });
    const queuedMessages = createQueuedMessagesRepository(env.db);
    queuedMessages.enqueue({ chatId: chat.id, taskId: archived.taskId, text: 'do not run after cancellation' });
    const cancellation = createTaskCancellationService({
      tasks: env.tasks,
      projects: env.projects,
      chats,
      worktree: env.worktree,
      events: env.events,
      queuedMessages,
    });

    await expect(cancellation.cancel(archived.taskId, 'archive')).resolves.toMatchObject({ status: 'cancelled_archived' });
    expect(existsSync(archived.worktreePath)).toBe(true);
    expect(chats.getById(chat.id)?.activeTaskId).toBeNull();
    expect(queuedMessages.listPending(chat.id)).toHaveLength(0);

    await expect(cancellation.cancel(discarded.taskId, 'discard')).resolves.toMatchObject({ status: 'cancelled_discarded' });
    expect(existsSync(discarded.worktreePath)).toBe(false);
    expect(git(repo.repoPath, ['branch', '--list', discarded.branchName])).toBe('');
  });

  it('updates the primary repository only after an explicit project remote-sync apply', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-remote-sync';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'idle');
    const root = dirname(repo.repoPath);
    const remotePath = join(root, 'origin.git');
    const upstreamPath = join(root, 'upstream');
    git(root, ['init', '--bare', remotePath]);
    git(repo.repoPath, ['remote', 'add', 'origin', remotePath]);
    git(repo.repoPath, ['push', '--set-upstream', 'origin', 'main']);
    git(root, ['clone', '--branch', 'main', remotePath, upstreamPath]);
    git(upstreamPath, ['config', 'user.name', 'Upstream Test']);
    git(upstreamPath, ['config', 'user.email', 'upstream@test.local']);
    writeFileSync(join(upstreamPath, 'remote.txt'), 'new remote target\n');
    git(upstreamPath, ['add', 'remote.txt']);
    git(upstreamPath, ['commit', '-m', 'advance remote main']);
    git(upstreamPath, ['push', 'origin', 'main']);

    const sync = createProjectRemoteSyncService({
      projects: env.projects,
      tasks: env.tasks,
      events: env.events,
    });
    const primaryBefore = git(repo.repoPath, ['rev-parse', 'main']);
    const inspected = await sync.sync(projectId, 'inspect');
    expect(inspected.status).toBe('fast_forward_available');
    expect(git(repo.repoPath, ['rev-parse', 'main'])).toBe(primaryBefore);
    expect(env.tasks.getById(taskId)?.status).toBe('idle');

    const applied = await sync.sync(projectId, 'apply');
    expect(applied.status).toBe('fast_forward_applied');
    expect(applied.staleTaskIds).toContain(taskId);
    expect(git(repo.repoPath, ['rev-parse', 'main'])).toBe(applied.remoteSha);
    expect(env.tasks.getById(taskId)?.status).toBe('stale');
    expect(git(seed.worktreePath, ['rev-parse', 'HEAD'])).toBe(seed.baseSha);
  });

  it('diff and rebase preserve task changes while advancing the base', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-rebase-1';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'idle');
    writeFileSync(join(seed.worktreePath, 'rebase.txt'), 'task change\n');
    const checkpointService = createCheckpointService(env.db, { worktree: env.worktree, events: env.events, tasks: env.tasks });
    await checkpointService.createCheckpoint({ taskId, message: 'task change', repoPath: repo.repoPath, worktreePath: seed.worktreePath, runtimeStatePath: repo.runtimePath });
    writeFileSync(join(repo.repoPath, 'main.txt'), 'main change\n');
    git(repo.repoPath, ['add', 'main.txt']);
    git(repo.repoPath, ['commit', '-m', 'advance main']);
    env.tasks.updateStatus(taskId, 'stale');

    const service = createGitTaskService({ tasks: env.tasks, events: env.events });
    expect((await service.listDiff(taskId)).map((entry) => entry.path)).toContain('rebase.txt');
    await service.rebase(taskId);

    const rebased = env.tasks.getById(taskId);
    expect(rebased?.status).toBe('idle');
    expect(rebased?.baseSha).toBe(git(repo.repoPath, ['rev-parse', 'HEAD']));
    expect((await service.listDiff(taskId)).map((entry) => entry.path)).toContain('rebase.txt');
  });

  it('reverts only changed files inside the task worktree', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-revert-1';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
      moveStatus(env, taskId, 'idle');
      writeFileSync(join(seed.worktreePath, 'README.md'), '# changed\n');
      writeFileSync(join(seed.worktreePath, 'added.txt'), 'added\n');

      const service = createGitTaskService({ tasks: env.tasks, events: env.events });
      expect((await service.listDiff(taskId)).map((entry) => entry.path)).toEqual(
        expect.arrayContaining(['README.md', 'added.txt']),
      );
      expect(await service.getDiffFile(taskId, 'added.txt')).toMatchObject({
        hunks: [expect.objectContaining({ header: 'new file: added.txt' })],
      });

      await service.revertFile(taskId, 'README.md');
      await service.revertFile(taskId, 'added.txt');

    expect(readFileSync(join(seed.worktreePath, 'README.md'), 'utf8').trim()).toBe('# demo');
      expect(existsSync(join(seed.worktreePath, 'added.txt'))).toBe(false);
      expect(await service.listDiff(taskId)).toEqual([]);
      await expect(service.revertFile(taskId, '../README.md')).rejects.toThrow(/repository-relative/);
      await expect(service.getDiffFile(taskId, '../README.md')).rejects.toThrow(/repository-relative/);
  });

  it('rejects a non-squash merge without mutating task state', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-mg-2';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'idle');

    writeFileSync(join(seed.worktreePath, 'nf.txt'), 'NF\n');

    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    await checkpointService.createCheckpoint({
      taskId,
      message: 'nf work',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });

    const mergeService = createMergeService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    await expect(mergeService.mergeTask({
      taskId,
      strategy: 'merge',
      commitMessage: 'agent: noff merge',
      repoPath: repo.repoPath,
    } as unknown as Parameters<typeof mergeService.mergeTask>[0])).rejects.toThrow(/use squash/);

    expect(git(repo.repoPath, ['rev-parse', 'HEAD'])).toBe(repo.mainHead);
    expect(env.tasks.getById(taskId)?.status).toBe('idle');
  });

  it('merge is refused while the task is running', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-mg-3';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'running');

    writeFileSync(join(seed.worktreePath, 'x.txt'), 'X\n');

    const checkpointService = createCheckpointService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });
    await checkpointService.createCheckpoint({
      taskId,
      message: 'running work',
      repoPath: repo.repoPath,
      worktreePath: seed.worktreePath,
      runtimeStatePath: repo.runtimePath,
    });

    const mergeService = createMergeService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    await expect(
      mergeService.mergeTask({
        taskId,
        strategy: 'squash',
        commitMessage: 'should fail',
        repoPath: repo.repoPath,
      }),
    ).rejects.toThrow(/merge disabled/);

    const taskAfter = env.tasks.getById(taskId);
    expect(taskAfter?.status).toBe('running');
  });

  it('keeps a reviewable task retryable when the primary checkout is dirty', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-mg-dirty-primary';
    await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'running');
    env.tasks.updateStatus(taskId, 'needs_review');
    writeFileSync(join(repo.repoPath, 'local-only.txt'), 'dirty\n');

    const mergeService = createMergeService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    await expect(mergeService.mergeTask({
      taskId,
      strategy: 'squash',
      commitMessage: 'must remain retryable',
      repoPath: repo.repoPath,
      runtimePath: repo.runtimePath,
    })).rejects.toThrow(/clean primary worktree/);

    expect(env.tasks.getById(taskId)?.status).toBe('needs_review');
    expect(env.events.stream('task', taskId).some((event) => event.type === 'merge.conflict')).toBe(false);
  });

});
