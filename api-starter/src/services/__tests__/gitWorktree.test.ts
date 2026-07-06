import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { GitWorktreeService, GitError } from '../gitWorktreeService';

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
  const root = mkdtempSync(join(tmpdir(), 'pi-wt-'));
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

function cleanup(path: string): void {
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
}

describe('GitWorktreeService (real git)', () => {
  let repo: TempRepo;

  beforeEach(() => {
    repo = makeTempRepo();
  });

  afterEach(() => {
    cleanup(join(repo.repoPath, '..'));
  });

  it('createTaskWorktree creates an on-disk worktree and branch off the base', async () => {
    const svc = new GitWorktreeService();
    const ref = await svc.createTaskWorktree({
      repoPath: repo.repoPath,
      taskId: 'task-1',
      baseBranch: 'main',
      runtimePath: repo.runtimePath,
    });

    expect(ref.branchName).toBe('agents/task/task-1');
    expect(ref.baseSha).toBe(repo.mainHead);
    expect(existsSync(ref.worktreePath)).toBe(true);
    expect(ref.worktreePath.startsWith(repo.runtimePath)).toBe(true);

    const list = git(repo.repoPath, ['worktree', 'list']);
    expect(toPosix(list)).toContain(toPosix(ref.worktreePath));

    const branches = git(repo.repoPath, ['branch', '--list', 'agents/task/task-1']);
    expect(branches).toContain('agents/task/task-1');
  });

  it('creates two worktrees for two tasks independently', async () => {
    const svc = new GitWorktreeService();
    const a = await svc.createTaskWorktree({
      repoPath: repo.repoPath,
      taskId: 'task-a',
      baseBranch: 'main',
      runtimePath: repo.runtimePath,
    });
    const b = await svc.createTaskWorktree({
      repoPath: repo.repoPath,
      taskId: 'task-b',
      baseBranch: 'main',
      runtimePath: repo.runtimePath,
    });

    expect(existsSync(a.worktreePath)).toBe(true);
    expect(existsSync(b.worktreePath)).toBe(true);
    expect(a.branchName).not.toBe(b.branchName);

    const list = git(repo.repoPath, ['worktree', 'list']);
    expect(toPosix(list)).toContain(toPosix(a.worktreePath));
    expect(toPosix(list)).toContain(toPosix(b.worktreePath));
  });

  it('main checkout remains clean and on main after creating worktrees', async () => {
    const svc = new GitWorktreeService();
    await svc.createTaskWorktree({
      repoPath: repo.repoPath,
      taskId: 'task-1',
      baseBranch: 'main',
      runtimePath: repo.runtimePath,
    });
    await svc.createTaskWorktree({
      repoPath: repo.repoPath,
      taskId: 'task-2',
      baseBranch: 'main',
      runtimePath: repo.runtimePath,
    });

    const status = git(repo.repoPath, ['status', '--porcelain']);
    expect(status).toBe('');
    const head = git(repo.repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    expect(head).toBe('main');
  });

  it('detectStaleBranch reports stale when base advances and fresh when in sync', async () => {
    const svc = new GitWorktreeService();
    const ref = await svc.createTaskWorktree({
      repoPath: repo.repoPath,
      taskId: 'task-stale',
      baseBranch: 'main',
      runtimePath: repo.runtimePath,
    });

    const fresh = await svc.detectStaleBranch({
      repoPath: repo.repoPath,
      branchName: ref.branchName,
      baseBranch: 'main',
    });
    expect(fresh).toEqual({ stale: false, behind: 0 });

    git(repo.repoPath, ['commit', '--allow-empty', '-m', 'advance main']);

    const stale = await svc.detectStaleBranch({
      repoPath: repo.repoPath,
      branchName: ref.branchName,
      baseBranch: 'main',
    });
    expect(stale).toEqual({ stale: true, behind: 1 });

    const staleWithThreshold = await svc.detectStaleBranch({
      repoPath: repo.repoPath,
      branchName: ref.branchName,
      baseBranch: 'main',
      thresholdCommits: 5,
    });
    expect(staleWithThreshold).toEqual({ stale: false, behind: 1 });
  });

  it('removeTaskWorktree removes the worktree dir and the branch', async () => {
    const svc = new GitWorktreeService();
    const ref = await svc.createTaskWorktree({
      repoPath: repo.repoPath,
      taskId: 'task-rm',
      baseBranch: 'main',
      runtimePath: repo.runtimePath,
    });
    expect(existsSync(ref.worktreePath)).toBe(true);

    await svc.removeTaskWorktree({
      repoPath: repo.repoPath,
      worktreePath: ref.worktreePath,
      branchName: ref.branchName,
    });

    expect(existsSync(ref.worktreePath)).toBe(false);
    const branches = git(repo.repoPath, ['branch', '--list', ref.branchName]);
    expect(branches).toBe('');
  });

  it('getMainHead returns the main worktree HEAD sha', async () => {
    const svc = new GitWorktreeService();
    const head = await svc.getMainHead(repo.repoPath);
    expect(head).toBe(repo.mainHead);
  });

  it('throws GitError when operating on a non-repo path', async () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'pi-norepo-'));
    try {
      const svc = new GitWorktreeService();
      await expect(
        svc.createTaskWorktree({
          repoPath: nonRepo,
          taskId: 'task-x',
          baseBranch: 'main',
          runtimePath: repo.runtimePath,
        }),
      ).rejects.toBeInstanceOf(GitError);
    } finally {
      cleanup(nonRepo);
    }
  });
});
