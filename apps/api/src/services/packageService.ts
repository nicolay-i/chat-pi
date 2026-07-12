import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { PackageManifestSchema } from '@pi-agents/contracts';
import type {
  PackageInstallResult,
  PackageManifest,
} from '@pi-agents/contracts';
import {
  createPackagesRepository,
  type PackageRecord,
  type PackagesRepository,
} from '../db';
import type { EventStore } from '../realtime/eventStore';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';

export type PackageSource = {
  kind: 'npm' | 'git' | 'local';
  ref: string;
};

export type PackageInstallInput = {
  source: PackageSource;
  manifest: PackageManifest;
};

export type LoadableExtensions = {
  extensions: string[];
  sources: string[];
};

export interface PackageService {
  resolve(source: PackageSource): Promise<PackageManifest>;
  install(
    projectId: string,
    input: PackageInstallInput,
  ): Promise<PackageInstallResult>;
  trust(packageId: string): Promise<void>;
  remove(packageId: string): Promise<void>;
  setEnabled(packageId: string, enabled: boolean): Promise<void>;
  listLoadableExtensions(projectId: string): Promise<LoadableExtensions>;
  list(projectId: string): Promise<PackageRecord[]>;
}

export type PackageServiceDeps = {
  eventStore: EventStore;
  packages?: PackagesRepository;
  projects?: ProjectsRepository;
};

type StoredSource = { kind: PackageSource['kind']; ref: string };

function basenameOf(ref: string): string {
  const cleaned = ref.replace(/[\\/]+$/, '');
  const slash = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
  const tail = slash >= 0 ? cleaned.slice(slash + 1) : cleaned;
  const stripped = tail.replace(/^v/, '').replace(/\.git$/, '');
  const atIdx = stripped.lastIndexOf('@');
  const base = atIdx > 0 ? stripped.slice(0, atIdx) : stripped;
  return base || 'package';
}

function packageDirectoryName(name: string, version: string): string {
  // Keep a manifest name out of filesystem semantics. Scoped names are valid,
  // while separators and traversal fragments must remain ordinary characters.
  return `${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function packageInstallPath(name: string, version: string): string {
  return `.agents/packages/${packageDirectoryName(name, version)}`;
}

function manifestToInstall(manifest: PackageManifest, projectId: string, source: PackageSource) {
  return {
    projectId,
    source: JSON.stringify(source),
    name: manifest.name,
    version: manifest.version,
    installPath: packageInstallPath(manifest.name, manifest.version),
    trusted: manifest.trusted,
    enabled: true,
    manifest,
  };
}

function parseSource(value: string): StoredSource {
  try {
    const source = JSON.parse(value) as StoredSource;
    if ((source.kind === 'npm' || source.kind === 'git' || source.kind === 'local') && typeof source.ref === 'string') return source;
  } catch {
    // Legacy rows retain their metadata but cannot be materialized safely.
  }
  throw new Error('package source metadata is unavailable; remove and resolve it again');
}

function packageRoot(project: { repoPath: string; agentsDir: string }): string {
  return resolve(project.repoPath, project.agentsDir, 'packages');
}

function lockPath(project: { repoPath: string; agentsDir: string }): string {
  return resolve(project.repoPath, project.agentsDir, 'packages.lock.json');
}

function assertNoSymlinks(path: string): void {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`package source contains symlink: ${entryPath}`);
    if (entry.isDirectory()) assertNoSymlinks(entryPath);
  }
}

export function createPackageService(
  db: DatabaseSync,
  deps: PackageServiceDeps,
): PackageService {
  const packages: PackagesRepository =
    deps.packages ?? createPackagesRepository(db);
  const eventStore = deps.eventStore;
  const projects = deps.projects;

  const writeLock = (projectId: string): void => {
    if (!projects) return;
    const project = projects.getById(projectId);
    if (!project) throw new Error(`project not found: ${projectId}`);
    const lock = lockPath(project);
    mkdirSync(join(lock, '..'), { recursive: true });
    const entries = packages.listByProject(projectId)
      .filter((pkg) => pkg.trusted && pkg.enabled)
      .map((pkg) => ({ name: pkg.name, version: pkg.version, source: parseSource(pkg.source), installPath: pkg.installPath }));
    const temporary = `${lock}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, packages: entries }, null, 2), 'utf8');
    renameSync(temporary, lock);
  };

  const materialize = (record: PackageRecord): void => {
    if (!projects) throw new Error('package materialization requires project repository access');
    const project = projects.getById(record.projectId);
    if (!project) throw new Error(`project not found: ${record.projectId}`);
    const source = parseSource(record.source);
    if (source.kind !== 'local') throw new Error(`${source.kind} package installation is not implemented yet`);
    const sourcePath = resolve(source.ref);
    if (!existsSync(sourcePath) || !lstatSync(sourcePath).isDirectory()) {
      throw new Error(`local package source does not exist: ${sourcePath}`);
    }
    assertNoSymlinks(sourcePath);
    const target = resolve(packageRoot(project), packageDirectoryName(record.name, record.version ?? '0.0.0'));
    if (!relative(packageRoot(project), target) || relative(packageRoot(project), target).startsWith('..')) {
      throw new Error('package target escapes .agents/packages');
    }
    mkdirSync(packageRoot(project), { recursive: true });
    rmSync(target, { recursive: true, force: true });
    cpSync(sourcePath, target, { recursive: true, dereference: false });
  };

  return {
    async resolve(source) {
      if (source.kind === 'local') {
        const sourcePath = resolve(source.ref);
        const manifestPath = join(sourcePath, 'pi-package.json');
        if (!existsSync(manifestPath)) throw new Error(`local package manifest not found: ${manifestPath}`);
        const manifest = PackageManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
        return { ...manifest, trusted: false };
      }
      const name = basenameOf(source.ref);
      const manifest: PackageManifest = {
        name,
        version: '0.0.0',
        description: `Resolved from ${source.kind}:${source.ref}`,
        resources: {
          extensions: [`${name}.extension`],
          skills: [`${name}.skill`],
          prompts: [],
          themes: [],
          providers: [],
        },
        trusted: false,
      };
      return manifest;
    },

    async install(projectId, input) {
      const rec = packages.create(manifestToInstall(input.manifest, projectId, input.source));
      if (rec.trusted) {
        materialize(rec);
        writeLock(projectId);
      }
      await eventStore.append({
        stream: 'project',
        streamId: projectId,
        projectId,
        type: 'package.installed',
        payload: {
          packageId: rec.id,
          name: rec.name,
          version: rec.version,
          source: rec.source,
          trusted: rec.trusted,
          enabled: rec.enabled,
        },
      });
      return {
        installId: rec.id,
        status: rec.trusted ? 'installed' : 'pending_trust',
        manifest: rec.manifest,
      };
    },

    async trust(packageId) {
      const rec = packages.getById(packageId);
      if (!rec) throw new Error(`package not found: ${packageId}`);
      materialize(rec);
      packages.update(packageId, { trusted: true });
      writeLock(rec.projectId);
    },

    async remove(packageId) {
      const rec = packages.getById(packageId);
      if (!rec) return;
      if (projects) {
        const project = projects.getById(rec.projectId);
        if (project) rmSync(resolve(packageRoot(project), packageDirectoryName(rec.name, rec.version ?? '0.0.0')), { recursive: true, force: true });
      }
      packages.delete(packageId);
      writeLock(rec.projectId);
    },

    async setEnabled(packageId, enabled) {
      const rec = packages.getById(packageId);
      if (!rec) throw new Error(`package not found: ${packageId}`);
      packages.update(packageId, { enabled });
      writeLock(rec.projectId);
    },

    async listLoadableExtensions(projectId) {
      const all = packages.listByProject(projectId);
      const extensions: string[] = [];
      const sources: string[] = [];
      for (const pkg of all) {
        if (!pkg.trusted || !pkg.enabled) continue;
        for (const ext of pkg.manifest.resources.extensions) {
          extensions.push(ext);
          sources.push(pkg.name);
        }
      }
      return { extensions, sources };
    },

    async list(projectId) {
      return packages.listByProject(projectId);
    },
  };
}
