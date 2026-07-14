import type { DatabaseSync } from 'node:sqlite';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
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
    ignisUrl: rec.ignisUrl,
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

export function runtimePathForRepository(repoPath: string): string {
  const repository = resolve(repoPath);
  return join(dirname(repository), `${basename(repository)}.pi-runtime`);
}

function ensureManagedRepositoryPath(repoPath: string, projectsRoot?: string): void {
  if (!projectsRoot) return;
  const root = resolve(projectsRoot);
  const candidate = resolve(repoPath);
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot === '' || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot)) {
    throw new Error(`repoPath must be inside PI_PROJECTS_ROOT (${root})`);
  }
}

export function createProjectService(db: DatabaseSync, options: { projectsRoot?: string } = {}): ProjectService {
  const projects = createProjectsRepository(db);
  return {
    async create(input) {
      // Runtime state owns worktrees and locks, so it must never dirty the
      // canonical checkout that is used as the merge target.
      ensureManagedRepositoryPath(input.repoPath, options.projectsRoot);
      const runtimeStatePath = runtimePathForRepository(input.repoPath);
      const rec = projects.create({
        name: input.name,
        repoPath: input.repoPath,
        defaultBranch: input.defaultBranch,
        agentsDir: input.agentsDir ?? '.agents',
        ignisUrl: input.ignisUrl ?? null,
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
      if (patch.repoPath !== undefined) ensureManagedRepositoryPath(patch.repoPath, options.projectsRoot);
      const rec = projects.update(id, {
        name: patch.name,
        repoPath: patch.repoPath,
        defaultBranch: patch.defaultBranch,
        agentsDir: patch.agentsDir,
        ignisUrl: patch.ignisUrl,
      });
      return rec ? toProject(rec) : undefined;
    },
    async remove(id) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('DELETE FROM chat_events WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM runtime_processes WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM queued_messages WHERE chat_id IN (SELECT id FROM chats WHERE project_id = ?)').run(id);
        db.prepare('DELETE FROM task_checkpoints WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)').run(id);
        db.prepare('DELETE FROM tasks WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM pi_sessions WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM chats WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM packages WHERE project_id = ?').run(id);
        db.prepare('DELETE FROM providers WHERE project_id = ?').run(id);
        projects.delete(id);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
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
