import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr ?? '').trim() || result.error?.message}`);
  }
  return (result.stdout ?? '').trim();
}

export class TemporaryGitRepository {
  readonly root = mkdtempSync(join(tmpdir(), 'pi-agents-git-'));
  readonly repoPath = join(this.root, 'repo');
  readonly runtimePath = join(this.root, 'runtime');

  constructor() {
    mkdirSync(this.repoPath, { recursive: true });
    mkdirSync(this.runtimePath, { recursive: true });
    git(this.repoPath, ['init', '-b', 'main']);
    git(this.repoPath, ['config', 'user.name', 'Pi Agents test']);
    git(this.repoPath, ['config', 'user.email', 'tests@pi-agents.local']);
    writeFileSync(join(this.repoPath, 'shared.txt'), 'base\n');
    git(this.repoPath, ['add', '.']);
    git(this.repoPath, ['commit', '-m', 'initial']);
  }

  get mainHead(): string {
    return git(this.repoPath, ['rev-parse', 'main']);
  }

  createWorktree(name: string): string {
    const path = join(this.runtimePath, 'worktrees', name);
    git(this.repoPath, ['worktree', 'add', '-b', `agents/${name}`, path, 'main']);
    return path;
  }

  changeAndCommit(worktreePath: string, content: string, message: string): void {
    writeFileSync(join(worktreePath, 'shared.txt'), content);
    git(worktreePath, ['add', 'shared.txt']);
    git(worktreePath, ['commit', '-m', message]);
  }

  advanceMain(content: string, message = 'advance main'): void {
    writeFileSync(join(this.repoPath, 'shared.txt'), content);
    git(this.repoPath, ['add', 'shared.txt']);
    git(this.repoPath, ['commit', '-m', message]);
  }

  rebase(worktreePath: string): { ok: boolean; output: string } {
    const result = spawnSync('git', ['rebase', 'main'], { cwd: worktreePath, encoding: 'utf8', windowsHide: true });
    return { ok: result.status === 0, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
  }

  dispose(): void {
    if (existsSync(this.root)) rmSync(this.root, { recursive: true, force: true });
  }
}
