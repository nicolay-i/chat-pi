import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { McpServerSchema, type McpServer } from '@pi-agents/contracts';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';

export type McpStore = { list(projectId: string): McpServer[]; save(projectId: string, server: McpServer): McpServer[]; has(projectId: string, id: string): boolean };

export function createMcpStore(projects: ProjectsRepository): McpStore {
  const pathFor = (projectId: string) => {
    const project = projects.getById(projectId);
    if (!project) throw new Error('project not found');
    return join(project.repoPath, project.agentsDir, 'mcp.json');
  };
  const list = (projectId: string) => {
    const path = pathFor(projectId);
    return existsSync(path) ? McpServerSchema.array().parse(JSON.parse(readFileSync(path, 'utf8'))) : [];
  };
  const write = (projectId: string, servers: McpServer[]) => {
    const path = pathFor(projectId);
    mkdirSync(join(path, '..'), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(servers, null, 2), 'utf8');
    renameSync(temporary, path);
  };
  return {
    list,
    save(projectId, server) {
      const valid = McpServerSchema.parse(server);
      const servers = list(projectId);
      const index = servers.findIndex((item) => item.id === valid.id);
      if (index >= 0) servers[index] = valid;
      else servers.push(valid);
      write(projectId, servers);
      return servers;
    },
    has(projectId, id) { return list(projectId).some((server) => server.id === id); },
  };
}
