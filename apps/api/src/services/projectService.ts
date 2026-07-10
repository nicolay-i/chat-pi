import type { DatabaseSync } from 'node:sqlite';
import type {
  Project,
  CreateProjectInput,
  ValidateRepoInput,
  ValidateRepoResult,
} from '@pi-agents/contracts';
import {
  createProjectsRepository,
  type ProjectRecord,
} from '../db';

export type ProjectPatch = Partial<CreateProjectInput>;

function toProject(rec: ProjectRecord): Project {
  return {
    id: rec.id,
    name: rec.name,
    repoPath: rec.repoPath,
    defaultBranch: rec.defaultBranch,
    agentsDir: rec.agentsDir,
    activeTaskCount: 0,
    updatedAt: rec.updatedAt,
  };
}

export interface ProjectService {
  create(input: CreateProjectInput): Promise<Project>;
  get(id: string): Promise<Project | undefined>;
  list(): Promise<Project[]>;
  update(id: string, patch: ProjectPatch): Promise<Project | undefined>;
  remove(id: string): Promise<void>;
  validateRepo(input: ValidateRepoInput): Promise<ValidateRepoResult>;
}

export function createProjectService(db: DatabaseSync): ProjectService {
  const projects = createProjectsRepository(db);
  return {
    async create(input) {
      const runtimeStatePath = `${input.repoPath.replace(/\/$/, '')}/.pi-runtime`;
      const rec = projects.create({
        name: input.name,
        repoPath: input.repoPath,
        defaultBranch: input.defaultBranch,
        agentsDir: input.agentsDir ?? '.agents',
        runtimeStatePath,
      });
      return toProject(rec);
    },
    async get(id) {
      const rec = projects.getById(id);
      return rec ? toProject(rec) : undefined;
    },
    async list() {
      return projects.list().map(toProject);
    },
    async update(id, patch) {
      const rec = projects.update(id, {
        name: patch.name,
        repoPath: patch.repoPath,
        defaultBranch: patch.defaultBranch,
        agentsDir: patch.agentsDir,
      });
      return rec ? toProject(rec) : undefined;
    },
    async remove(id) {
      db.prepare('DELETE FROM chat_events WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
      db.prepare('DELETE FROM chats WHERE project_id = ?').run(id);
      projects.delete(id);
    },
    async validateRepo(input) {
      const repoPath = input.repoPath?.trim();
      const defaultBranch = input.defaultBranch?.trim();
      if (!repoPath || !defaultBranch) {
        return {
          valid: false,
          agentsDirExists: false,
          error: 'repoPath and defaultBranch are required',
        };
      }
      return {
        valid: true,
        branch: defaultBranch,
        agentsDirExists: true,
      };
    },
  };
}
