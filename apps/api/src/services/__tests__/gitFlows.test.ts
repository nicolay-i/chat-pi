import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { DatabaseSync } from 'node:sqlite';

import { createDb, migrate } from '../../db';
import { createTasksRepository, createProjectsRepository } from '../../db';
import { createCheckpointsRepository } from '../../db/repositories/checkpointsRepository';
import { createEventStore } from '../../realtime/eventStore';
import { GitWorktreeService } from '../gitWorktreeService';
import { createCheckpointService } from '../checkpointService';
import { createForkService } from '../forkService';
import { createRollbackService } from '../rollbackService';
import { createMergeService } from '../mergeService';
import { createGitTaskService } from '../gitTaskService';
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
    git(seed.worktreePath, ['add', 'added.txt']);

    const service = createGitTaskService({ tasks: env.tasks, events: env.events });
    expect((await service.listDiff(taskId)).map((entry) => entry.path)).toEqual(
      expect.arrayContaining(['README.md', 'added.txt']),
    );

    await service.revertFile(taskId, 'README.md');
    await service.revertFile(taskId, 'added.txt');

    expect(readFileSync(join(seed.worktreePath, 'README.md'), 'utf8').trim()).toBe('# demo');
    expect(existsSync(join(seed.worktreePath, 'added.txt'))).toBe(false);
    expect(await service.listDiff(taskId)).toEqual([]);
    await expect(service.revertFile(taskId, '../README.md')).rejects.toThrow(/repository-relative/);
  });

  it('no-ff merge creates a merge commit on target', async () => {
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

    const result = await mergeService.mergeTask({
      taskId,
      strategy: 'merge',
      commitMessage: 'agent: noff merge',
      repoPath: repo.repoPath,
    });

    expect(result.mergedSha).not.toBe(repo.mainHead);
    const parents = git(repo.repoPath, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ');
    expect(parents.length).toBeGreaterThanOrEqual(3);
    const taskAfter = env.tasks.getById(taskId);
    expect(taskAfter?.status).toBe('merged');
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

  it('patch strategy throws a clear not-implemented error', async () => {
    const projectId = seedProject(env, repo.repoPath, repo.runtimePath);
    const taskId = 'task-mg-4';
    const seed = await seedTask({ env, projectId, taskId, repoPath: repo.repoPath, runtimePath: repo.runtimePath });
    moveStatus(env, taskId, 'idle');

    const mergeService = createMergeService(env.db, {
      worktree: env.worktree,
      events: env.events,
      tasks: env.tasks,
    });

    await expect(
      mergeService.mergeTask({
        taskId,
        strategy: 'patch',
        commitMessage: 'patch attempt',
        repoPath: repo.repoPath,
      }),
    ).rejects.toThrow(/not implemented/);
    void seed;
  });
});
