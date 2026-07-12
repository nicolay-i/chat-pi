import { describe, expect, it } from 'vitest';
import { createPiSandboxLaunch } from '../piSandbox';

describe('Pi sandbox launch', () => {
  const input = {
    cwd: '/projects/demo/runtime/worktrees/task-1',
    sessionPath: '/projects/demo/runtime/sessions/chat-1.jsonl',
    agentDir: '/data/pi-agent',
    readOnlyWorkspace: false,
  };

  it('does not rewrite paths when the sandbox is disabled', () => {
    expect(createPiSandboxLaunch({ mode: 'none' }, input)).toEqual({
      spawnCwd: input.cwd,
      cwd: input.cwd,
      sessionPath: input.sessionPath,
      agentDir: input.agentDir,
      resourceRoot: input.cwd,
    });
  });

  it('binds only the selected writable worktree, session directory and Pi state', () => {
    const launch = createPiSandboxLaunch({
      mode: 'bwrap', binary: '/usr/bin/bwrap', platform: 'linux', allowedEnv: ['OPENAI_API_KEY'],
      environment: { OPENAI_API_KEY: 'test-key', INTERNAL_SECRET: 'must-not-pass' },
    }, input);
    expect(launch.command).toBe('/usr/bin/bwrap');
    expect(launch.commandArgs).toEqual(expect.arrayContaining([
      '--unshare-user', '--unshare-pid', '--share-net',
      '--clearenv', '--setenv', 'OPENAI_API_KEY', 'test-key',
      '--dir', '/tmp', '--dir', '/dev',
      '--dev-bind', '/dev/urandom', '/dev/urandom',
      '--bind', input.cwd, '/workspace',
      '--bind', '/projects/demo/runtime/sessions', '/sessions',
      '--bind', input.agentDir, '/pi-agent',
    ]));
    expect(launch.commandArgs).not.toContain('--proc');
    expect(launch.commandArgs).not.toContain('INTERNAL_SECRET');
    expect(launch).toMatchObject({
      spawnCwd: input.cwd,
      cwd: '/workspace',
      sessionPath: '/sessions/chat-1.jsonl',
      agentDir: '/pi-agent',
      resourceRoot: '/workspace',
    });
  });

  it('mounts the workspace read-only for discussion and planning', () => {
    const launch = createPiSandboxLaunch(
      { mode: 'bwrap', platform: 'linux' },
      { ...input, readOnlyWorkspace: true },
    );
    expect(launch.commandArgs).toEqual(expect.arrayContaining(['--ro-bind', input.cwd, '/workspace']));
  });

  it('rejects bwrap on Windows or without an isolated Pi state directory', () => {
    expect(() => createPiSandboxLaunch({ mode: 'bwrap', platform: 'win32' }, input)).toThrow('only on Linux');
    expect(() => createPiSandboxLaunch({ mode: 'bwrap', platform: 'linux' }, { ...input, agentDir: undefined })).toThrow('PI_AGENT_DIR');
  });
});
