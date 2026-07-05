import { describe, it, expect } from 'vitest';
import { ProjectSchema, SendMessageInputSchema, RunModeSchema } from './schemas';

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
