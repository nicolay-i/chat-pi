import { basename, dirname } from 'node:path';

export type PiSandboxMode = 'none' | 'bwrap';

export type PiSandboxOptions = {
  mode: PiSandboxMode;
  binary?: string;
  platform?: NodeJS.Platform;
  allowedEnv?: string[];
  environment?: NodeJS.ProcessEnv;
};

export type PiSandboxLaunchInput = {
  cwd: string;
  sessionPath: string;
  agentDir?: string;
  readOnlyWorkspace: boolean;
};

export type PiSandboxLaunch = {
  command?: string;
  commandArgs?: string[];
  cwd: string;
  sessionPath: string;
  agentDir?: string;
  resourceRoot: string;
};

/**
 * Builds a minimal Linux namespace boundary for a Pi child. Only the selected
 * worktree, session directory and Pi state are mounted writable. Network stays
 * available because providers need it; host networking and the Docker socket
 * are never inherited by the child.
 */
export function createPiSandboxLaunch(
  options: PiSandboxOptions | undefined,
  input: PiSandboxLaunchInput,
): PiSandboxLaunch {
  if (!options || options.mode === 'none') {
    return {
      cwd: input.cwd,
      sessionPath: input.sessionPath,
      agentDir: input.agentDir,
      resourceRoot: input.cwd,
    };
  }
  if ((options.platform ?? process.platform) === 'win32') {
    throw new Error('PI_SANDBOX_MODE=bwrap is supported only on Linux hosts');
  }
  if (!input.agentDir) {
    throw new Error('PI_SANDBOX_MODE=bwrap requires PI_AGENT_DIR');
  }

  const sessionDir = dirname(input.sessionPath);
  const sandboxSessionPath = `/sessions/${basename(input.sessionPath)}`;
  const workspaceBind = input.readOnlyWorkspace ? '--ro-bind' : '--bind';
  const environment = options.environment ?? process.env;
  const envArgs = (options.allowedEnv ?? [])
    .flatMap((name) => environment[name] === undefined ? [] : ['--setenv', name, environment[name]!]);
  return {
    command: options.binary ?? 'bwrap',
    commandArgs: [
      '--die-with-parent', '--new-session',
      '--unshare-user', '--unshare-pid', '--unshare-uts', '--unshare-ipc', '--share-net',
      '--clearenv', '--setenv', 'PATH', '/usr/local/bin:/usr/bin:/bin',
      ...envArgs,
      '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/bin', '/bin',
      '--ro-bind', '/lib', '/lib',
      '--ro-bind-try', '/lib64', '/lib64',
      '--ro-bind', '/usr/local', '/usr/local',
      '--ro-bind-try', '/etc/ssl', '/etc/ssl',
      '--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf',
      '--ro-bind-try', '/etc/hosts', '/etc/hosts',
      workspaceBind, input.cwd, '/workspace',
      '--bind', sessionDir, '/sessions',
      '--bind', input.agentDir, '/pi-agent',
      '--setenv', 'HOME', '/tmp',
      '--setenv', 'PI_CODING_AGENT_DIR', '/pi-agent',
      '--chdir', '/workspace',
    ],
    cwd: '/workspace',
    sessionPath: sandboxSessionPath,
    agentDir: '/pi-agent',
    resourceRoot: '/workspace',
  };
}
