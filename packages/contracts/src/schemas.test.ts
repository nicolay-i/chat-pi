import { describe, it, expect } from 'vitest';
import {
  ProjectSchema,
  SendMessageInputSchema,
  RunModeSchema,
  CapabilitiesSchema,
  CheckpointSchema,
  DiffEntrySchema,
  ValidateRepoResultSchema,
  PackageManifestSchema,
} from './schemas';

describe('ProjectSchema', () => {
  it('parses a valid project with defaults applied', () => {
    const parsed = ProjectSchema.parse({
      id: 'project-1',
      name: 'Demo',
      repoPath: '/repo',
      defaultBranch: 'main',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(parsed.id).toBe('project-1');
    expect(parsed.agentsDir).toBe('.agents');
    expect(parsed.activeTaskCount).toBe(0);
  });

  it('rejects a project missing required id', () => {
    expect(() =>
      ProjectSchema.parse({
        name: 'Demo',
        repoPath: '/repo',
        defaultBranch: 'main',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('SendMessageInputSchema', () => {
  it('parses a valid send message', () => {
    const parsed = SendMessageInputSchema.parse({
      text: 'hello',
      behavior: 'send',
    });

    expect(parsed.text).toBe('hello');
    expect(parsed.behavior).toBe('send');
    expect(parsed.mode).toBeUndefined();
  });

  it('rejects an empty text', () => {
    expect(() =>
      SendMessageInputSchema.parse({ text: '', behavior: 'send' }),
    ).toThrow();
  });

  it('rejects an unknown behavior', () => {
    expect(() =>
      SendMessageInputSchema.parse({ text: 'hi', behavior: 'bogus' }),
    ).toThrow();
  });
});

describe('RunModeSchema', () => {
  it('accepts all defined run modes', () => {
    const modes = ['discussion', 'planning', 'implementation', 'orchestration'];
    for (const mode of modes) {
      expect(RunModeSchema.parse(mode)).toBe(mode);
    }
  });
});

describe('CapabilitiesSchema', () => {
  it('parses a valid capabilities object', () => {
    const parsed = CapabilitiesSchema.parse({
      apiVersion: '0.0.0',
      piAvailable: false,
      gitAvailable: true,
      supportsWorktrees: true,
      supportsSse: true,
      supportsWebSocket: false,
      supportsPackageInstall: true,
      supportsVscodeWeb: false,
      supportsIgnis: false,
    });
    expect(parsed.apiVersion).toBe('0.0.0');
    expect(parsed.supportsWorktrees).toBe(true);
  });

  it('rejects a capabilities object missing a required flag', () => {
    expect(() =>
      CapabilitiesSchema.parse({
        apiVersion: '0.0.0',
        piAvailable: false,
        gitAvailable: true,
        supportsWorktrees: true,
        supportsSse: true,
        supportsWebSocket: false,
        supportsPackageInstall: true,
        supportsVscodeWeb: false,
      }),
    ).toThrow();
  });
});

describe('CheckpointSchema', () => {
  it('parses a valid checkpoint', () => {
    const parsed = CheckpointSchema.parse({
      id: 'cp-1',
      taskId: 'task-1',
      message: 'initial',
      sha: 'abc123',
      changedFiles: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(parsed.id).toBe('cp-1');
    expect(parsed.sha).toBe('abc123');
  });

  it('rejects a checkpoint missing required message', () => {
    expect(() =>
      CheckpointSchema.parse({
        id: 'cp-1',
        taskId: 'task-1',
        changedFiles: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toThrow();
  });
});

describe('DiffEntrySchema', () => {
  it('parses a valid diff entry', () => {
    const parsed = DiffEntrySchema.parse({
      path: 'src/a.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
    });
    expect(parsed.status).toBe('modified');
  });

  it('rejects an unknown status', () => {
    expect(() =>
      DiffEntrySchema.parse({ path: 'src/a.ts', status: 'bogus', additions: 0, deletions: 0 }),
    ).toThrow();
  });
});

describe('ValidateRepoResultSchema', () => {
  it('parses a valid result', () => {
    const parsed = ValidateRepoResultSchema.parse({
      valid: true,
      branch: 'main',
      agentsDirExists: true,
    });
    expect(parsed.valid).toBe(true);
  });

  it('rejects a result missing agentsDirExists', () => {
    expect(() => ValidateRepoResultSchema.parse({ valid: true })).toThrow();
  });
});

describe('PackageManifestSchema', () => {
  it('parses a valid manifest', () => {
    const parsed = PackageManifestSchema.parse({
      name: 'my-pkg',
      version: '1.0.0',
      resources: {
        extensions: [],
        skills: ['s1'],
        prompts: [],
        themes: [],
        providers: [],
      },
      trusted: false,
    });
    expect(parsed.name).toBe('my-pkg');
    expect(parsed.resources.skills).toEqual(['s1']);
  });

  it('rejects a manifest missing resources', () => {
    expect(() =>
      PackageManifestSchema.parse({ name: 'my-pkg', version: '1.0.0', trusted: false }),
    ).toThrow();
  });
});
