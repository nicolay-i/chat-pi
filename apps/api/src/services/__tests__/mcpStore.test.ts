import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from '../../db';
import { createProjectsRepository } from '../../db/repositories/projectsRepository';
import { TemporaryGitRepository } from '../../test/harness/TemporaryGitRepository';
import { createMcpStore } from '../mcpStore';

describe('mcpStore', () => {
  const repositories: TemporaryGitRepository[] = [];

  afterEach(() => {
    for (const repository of repositories.splice(0)) repository.dispose();
  });

  it('persists project configuration in .agents so it is included in backup', () => {
    const repository = new TemporaryGitRepository();
    repositories.push(repository);
    const db = createDb(':memory:');
    const projects = createProjectsRepository(db);
    const project = projects.create({
      name: 'MCP source of truth',
      repoPath: repository.repoPath,
      defaultBranch: 'main',
      agentsDir: '.agents',
      runtimeStatePath: repository.runtimePath,
    });
    const store = createMcpStore(projects);
    const server = {
      id: 'filesystem',
      command: 'npx -y @modelcontextprotocol/server-filesystem',
      transport: 'stdio' as const,
      env: { PROJECT_ROOT: repository.repoPath },
      enabledPerMode: ['implementation'],
    };

    expect(store.save(project.id, server)).toEqual([server]);
    const agentPath = join(repository.repoPath, '.agents', 'mcp.json');

    expect(JSON.parse(readFileSync(agentPath, 'utf8'))).toEqual([server]);
    expect(existsSync(join(repository.runtimePath, 'mcp.json'))).toBe(false);
    expect(store.list(project.id)).toEqual([server]);
  });
});
