import type { DatabaseSync } from 'node:sqlite';
import type { PackageManifest } from '@pi-agents/contracts';
import { camelToSnake, nowIso, randomId } from '../util';

export type PackageRow = {
  id: string;
  project_id: string;
  source: string;
  name: string;
  version: string | null;
  install_path: string;
  trusted: number;
  enabled: number;
  manifest_json: string;
  created_at: string;
  updated_at: string;
};

export type PackageRecord = {
  id: string;
  projectId: string;
  source: string;
  name: string;
  version: string | null;
  installPath: string;
  trusted: boolean;
  enabled: boolean;
  manifest: PackageManifest;
  createdAt: string;
  updatedAt: string;
};

export type PackageInput = {
  projectId: string;
  source: string;
  name: string;
  version?: string | null;
  installPath: string;
  trusted?: boolean;
  enabled?: boolean;
  manifest: PackageManifest;
};

export type PackagePatch = Partial<
  Omit<PackageInput, 'projectId' | 'manifest'>
> & {
  manifest?: PackageManifest;
};

function rowToPackage(row: PackageRow): PackageRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    source: row.source,
    name: row.name,
    version: row.version,
    installPath: row.install_path,
    trusted: row.trusted === 1,
    enabled: row.enabled === 1,
    manifest: JSON.parse(row.manifest_json) as PackageManifest,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type PackagesRepository = {
  create(input: PackageInput): PackageRecord;
  getById(id: string): PackageRecord | undefined;
  listByProject(projectId: string): PackageRecord[];
  update(id: string, patch: PackagePatch): PackageRecord | undefined;
  delete(id: string): void;
};

export function createPackagesRepository(db: DatabaseSync): PackagesRepository {
  return {
    create(input) {
      const id = randomId();
      const now = nowIso();
      db.prepare(
        `INSERT INTO packages (id, project_id, source, name, version, install_path, trusted, enabled, manifest_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.projectId,
        input.source,
        input.name,
        input.version ?? null,
        input.installPath,
        input.trusted ? 1 : 0,
        input.enabled === false ? 0 : 1,
        JSON.stringify(input.manifest),
        now,
        now,
      );
      return {
        id,
        projectId: input.projectId,
        source: input.source,
        name: input.name,
        version: input.version ?? null,
        installPath: input.installPath,
        trusted: input.trusted ?? false,
        enabled: input.enabled !== false,
        manifest: input.manifest,
        createdAt: now,
        updatedAt: now,
      };
    },
    getById(id) {
      const row = db.prepare('SELECT * FROM packages WHERE id = ?').get(id) as
        | PackageRow
        | undefined;
      return row ? rowToPackage(row) : undefined;
    },
    listByProject(projectId) {
      const rows = db
        .prepare('SELECT * FROM packages WHERE project_id = ? ORDER BY created_at ASC')
        .all(projectId) as unknown as PackageRow[];
      return rows.map(rowToPackage);
    },
    update(id, patch) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      const now = nowIso();
      type SqlVal = string | number | bigint | null | Uint8Array;
      if (entries.length === 0) {
        db.prepare('UPDATE packages SET updated_at = ? WHERE id = ?').run(now, id);
      } else {
        const setCols: string[] = [];
        const vals: SqlVal[] = [];
        for (const [k, v] of entries as [string, unknown][]) {
          if (k === 'trusted' || k === 'enabled') {
            setCols.push(`${camelToSnake(k)} = ?`);
            vals.push(v ? 1 : 0);
          } else if (k === 'manifest') {
            setCols.push('manifest_json = ?');
            vals.push(JSON.stringify(v));
          } else {
            setCols.push(`${camelToSnake(k)} = ?`);
            vals.push(v as SqlVal);
          }
        }
        setCols.push('updated_at = ?');
        vals.push(now);
        vals.push(id);
        db.prepare(`UPDATE packages SET ${setCols.join(', ')} WHERE id = ?`).run(
          ...vals,
        );
      }
      return this.getById(id);
    },
    delete(id) {
      db.prepare('DELETE FROM packages WHERE id = ?').run(id);
    },
  };
}
