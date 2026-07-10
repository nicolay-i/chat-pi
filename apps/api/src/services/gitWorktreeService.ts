import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runGit, type RunGit, GitError } from './gitExec';

export type CreateWorktreeInput = {
  repoPath: string;
  taskId: string;
  baseBranch: string;
  runtimePath: string;
};

export type WorktreeRef = {
  branchName: string;
  worktreePath: string;
  baseSha: string;
};

export type RemoveWorktreeInput = {
  repoPath: string;
  worktreePath: string;
  branchName: string;
};

export type DetectStaleInput = {
  repoPath: string;
  branchName: string;
  baseBranch: string;
  thresholdCommits?: number;
};

export type StaleResult = { stale: boolean; behind: number };

export type GitWorktreeServiceOptions = {
  git?: RunGit;
};

export class GitWorktreeService {
  private readonly git: RunGit;

  constructor(opts: GitWorktreeServiceOptions = {}) {
    this.git = opts.git ?? runGit;
  }

  async createTaskWorktree(input: CreateWorktreeInput): Promise<WorktreeRef> {
    const { repoPath, taskId, baseBranch, runtimePath } = input;

    const inside = this.git(['rev-parse', '--is-inside-work-tree'], { cwd: repoPath }).stdout;
    if (inside !== 'true') {
      throw new Error(`not a git work tree: ${repoPath}`);
    }

    const baseSha = this.git(['rev-parse', baseBranch], { cwd: repoPath }).stdout;
    const branchName = `agents/task/${taskId}`;
    const worktreePath = join(runtimePath, 'worktrees', taskId);
    const worktreesRoot = join(runtimePath, 'worktrees');
    mkdirSync(worktreesRoot, { recursive: true });

    this.git(['branch', branchName, baseSha], { cwd: repoPath });
    this.git(['worktree', 'add', worktreePath, branchName], { cwd: repoPath });

    return { branchName, worktreePath, baseSha };
  }

  async removeTaskWorktree(input: RemoveWorktreeInput): Promise<void> {
    const { repoPath, worktreePath, branchName } = input;
    if (existsSync(worktreePath)) {
      this.git(['worktree', 'remove', '--force', worktreePath], { cwd: repoPath });
    }
    if (existsSync(worktreePath)) {
      rmSync(worktreePath, { recursive: true, force: true });
    }
    this.git(['branch', '-D', branchName], { cwd: repoPath });
  }

  async detectStaleBranch(input: DetectStaleInput): Promise<StaleResult> {
    const { repoPath, branchName, baseBranch, thresholdCommits } = input;
    const range = `${branchName}..${baseBranch}`;
    const out = this.git(['rev-list', '--count', range], { cwd: repoPath }).stdout;
    const behind = Number.parseInt(out, 10) || 0;
    const threshold = thresholdCommits ?? 0;
    return { stale: behind > threshold, behind };
  }

  async getMainHead(repoPath: string): Promise<string> {
    return this.git(['rev-parse', 'HEAD'], { cwd: repoPath }).stdout;
  }
}

export { GitError };
