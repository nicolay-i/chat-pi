import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TemporaryGitRepository } from '../../test/harness/TemporaryGitRepository';
import { piResourceArgs } from '../piResources';

describe('piResourceArgs', () => {
  const repositories: TemporaryGitRepository[] = [];

  afterEach(() => {
    for (const repository of repositories.splice(0)) repository.dispose();
  });

  it('loads only explicit project .agents resources for a new Pi session', () => {
    const repository = new TemporaryGitRepository();
    repositories.push(repository);
    const agents = join(repository.repoPath, '.agents');
    const extension = join(agents, 'extensions', 'review.mjs');
    mkdirSync(join(agents, 'extensions'), { recursive: true });
    mkdirSync(join(agents, 'skills', 'review'), { recursive: true });
    mkdirSync(join(agents, 'prompts'), { recursive: true });
    mkdirSync(join(agents, 'themes'), { recursive: true });
    writeFileSync(extension, 'export default {};', 'utf8');
    writeFileSync(join(agents, 'skills', 'review', 'SKILL.md'), '# Review', 'utf8');

    expect(piResourceArgs(repository.repoPath)).toEqual([
      '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes',
      '--extension', extension,
      '--skill', join(agents, 'skills'),
      '--prompt-template', join(agents, 'prompts'),
      '--theme', join(agents, 'themes'),
    ]);
  });

  it('does not add discovery-disabling flags when the project has no .agents directory', () => {
    const repository = new TemporaryGitRepository();
    repositories.push(repository);

    expect(piResourceArgs(repository.repoPath)).toEqual([]);
  });
});
