import type { DatabaseSync } from 'node:sqlite';
import { camelToSnake, nowIso, randomId } from '../util';

export type ProviderRow = {
  id: string;
  project_id: string;
  name: string;
  type: string;
  base_url: string | null;
  secret_ref: string | null;
  config_json: string;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export type ProviderRecord = {
  id: string;
  projectId: string;
  name: string;
  type: string;
  baseUrl: string | null;
  secretRef: string | null;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProviderInput = {
  projectId: string;
  name: string;
  type: string;
  baseUrl?: string | null;
  secretRef?: string | null;
  config?: Record<string, unknown>;
  enabled?: boolean;
};

export type ProviderPatch = Partial<Omit<ProviderInput, 'projectId'>>;

function rowToProvider(row: ProviderRow): ProviderRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    secretRef: row.secret_ref,
    config: JSON.parse(row.config_json) as Record<string, unknown>,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ProvidersRepository = {
  create(input: ProviderInput): ProviderRecord;
  getById(id: string): ProviderRecord | undefined;
  listByProject(projectId: string): ProviderRecord[];
  update(id: string, patch: ProviderPatch): ProviderRecord | undefined;
  delete(id: string): void;
};

export function createProvidersRepository(db: DatabaseSync): ProvidersRepository {
  return {
    create(input) {
      const id = randomId();
      const now = nowIso();
      const configJson = JSON.stringify(input.config ?? {});
      db.prepare(
        `INSERT INTO providers (id, project_id, name, type, base_url, secret_ref, config_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.projectId,
        input.name,
        input.type,
        input.baseUrl ?? null,
        input.secretRef ?? null,
        configJson,
        input.enabled === false ? 0 : 1,
        now,
        now,
      );
      return {
        id,
        projectId: input.projectId,
        name: input.name,
        type: input.type,
        baseUrl: input.baseUrl ?? null,
        secretRef: input.secretRef ?? null,
        config: input.config ?? {},
        enabled: input.enabled !== false,
        createdAt: now,
        updatedAt: now,
      };
    },
    getById(id) {
      const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as
        | ProviderRow
        | undefined;
      return row ? rowToProvider(row) : undefined;
    },
    listByProject(projectId) {
      const rows = db
        .prepare('SELECT * FROM providers WHERE project_id = ? ORDER BY created_at ASC')
        .all(projectId) as unknown as ProviderRow[];
      return rows.map(rowToProvider);
    },
    update(id, patch) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      const now = nowIso();
      type SqlVal = string | number | bigint | null | Uint8Array;
      if (entries.length === 0) {
        db.prepare('UPDATE providers SET updated_at = ? WHERE id = ?').run(now, id);
      } else {
        const setCols: string[] = [];
        const vals: SqlVal[] = [];
        for (const [k, v] of entries as [string, unknown][]) {
          if (k === 'enabled') {
            setCols.push(`${camelToSnake(k)} = ?`);
            vals.push(v ? 1 : 0);
          } else if (k === 'config') {
            setCols.push('config_json = ?');
            vals.push(JSON.stringify(v));
          } else {
            setCols.push(`${camelToSnake(k)} = ?`);
            vals.push(v as SqlVal);
          }
        }
        setCols.push('updated_at = ?');
        vals.push(now);
        vals.push(id);
        db.prepare(`UPDATE providers SET ${setCols.join(', ')} WHERE id = ?`).run(
          ...vals,
        );
      }
      return this.getById(id);
    },
    delete(id) {
      db.prepare('DELETE FROM providers WHERE id = ?').run(id);
    },
  };
}
