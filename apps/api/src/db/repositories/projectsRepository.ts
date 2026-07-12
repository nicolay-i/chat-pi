import type { DatabaseSync } from 'node:sqlite';
import { camelToSnake, nowIso, randomId } from '../util';

export type ProjectRow = {
  id: string;
  name: string;
  repo_path: string;
  default_branch: string;
  agents_dir: string;
  ignis_url: string | null;
  runtime_state_path: string;
  default_model_id: string | null;
  theme_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  repoPath: string;
  defaultBranch: string;
  agentsDir: string;
  ignisUrl: string | null;
  runtimeStatePath: string;
  defaultModelId: string | null;
  themeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  name: string;
  repoPath: string;
  defaultBranch: string;
  agentsDir?: string;
  ignisUrl?: string | null;
  runtimeStatePath: string;
  defaultModelId?: string | null;
  themeId?: string | null;
};

function rowToProject(row: ProjectRow): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    repoPath: row.repo_path,
    defaultBranch: row.default_branch,
    agentsDir: row.agents_dir,
    ignisUrl: row.ignis_url,
    runtimeStatePath: row.runtime_state_path,
    defaultModelId: row.default_model_id,
    themeId: row.theme_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ProjectsRepository = {
  create(input: ProjectInput): ProjectRecord;
  getById(id: string): ProjectRecord | undefined;
  list(): ProjectRecord[];
  update(id: string, patch: Partial<ProjectInput>): ProjectRecord | undefined;
  delete(id: string): void;
};

export function createProjectsRepository(db: DatabaseSync): ProjectsRepository {
  return {
    create(input) {
      const id = randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO projects (id, name, repo_path, default_branch, agents_dir, ignis_url, runtime_state_path, default_model_id, theme_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.name,
        input.repoPath,
        input.defaultBranch,
        input.agentsDir ?? '.agents',
        input.ignisUrl ?? null,
        input.runtimeStatePath,
        input.defaultModelId ?? null,
        input.themeId ?? null,
        now,
        now,
      );
      return {
        id,
        name: input.name,
        repoPath: input.repoPath,
        defaultBranch: input.defaultBranch,
        agentsDir: input.agentsDir ?? '.agents',
        ignisUrl: input.ignisUrl ?? null,
        runtimeStatePath: input.runtimeStatePath,
        defaultModelId: input.defaultModelId ?? null,
        themeId: input.themeId ?? null,
        createdAt: now,
        updatedAt: now,
      };
    },
    getById(id) {
      const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
        | ProjectRow
        | undefined;
      return row ? rowToProject(row) : undefined;
    },
    list() {
      const rows = db
        .prepare('SELECT * FROM projects ORDER BY created_at ASC')
        .all() as unknown as ProjectRow[];
      return rows.map(rowToProject);
    },
    update(id, patch) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      const now = nowIso();
      if (entries.length === 0) {
        db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, id);
      } else {
        const setCols = entries.map(([k]) => `${camelToSnake(k)} = ?`);
        const vals = entries.map(([, v]) => v);
        setCols.push('updated_at = ?');
        vals.push(now);
        vals.push(id);
        db.prepare(`UPDATE projects SET ${setCols.join(', ')} WHERE id = ?`).run(...vals);
      }
      return this.getById(id);
    },
    delete(id) {
      db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    },
  };
}
