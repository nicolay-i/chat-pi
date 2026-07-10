import { spawnSync } from 'node:child_process';

export type RunGitOptions = { cwd: string };

export type RunGitResult = { stdout: string; stderr: string };

export type RunGit = (args: string[], opts: RunGitOptions) => RunGitResult;

export type GitErrorContext = {
  args: readonly string[];
  cwd: string;
  stdout: string;
  stderr: string;
  status: number | null;
  cause?: NodeJS.ErrnoException;
};

export class GitError extends Error {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;

  constructor(ctx: GitErrorContext) {
    const renderedArgs = ctx.args.map((a) => a).join(' ');
    const detail = ctx.stderr || ctx.stdout || ctx.cause?.message || 'unknown error';
    super(`git ${renderedArgs} failed in ${ctx.cwd} (exit ${ctx.status}): ${detail}`.trim());
    this.name = 'GitError';
    this.args = ctx.args;
    this.cwd = ctx.cwd;
    this.stdout = ctx.stdout;
    this.stderr = ctx.stderr;
    this.status = ctx.status;
    if (ctx.cause) this.cause = ctx.cause;
  }
}

export function runGit(args: string[], opts: RunGitOptions): RunGitResult {
  const result = spawnSync('git', args, {
    cwd: opts.cwd,
    encoding: 'utf8',
    windowsHide: true,
  });
  const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';

  if (result.error || result.status !== 0) {
    throw new GitError({
      args,
      cwd: opts.cwd,
      stdout,
      stderr,
      status: result.status ?? null,
      cause: result.error,
    });
  }

  return { stdout, stderr };
}
