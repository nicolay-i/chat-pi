import type { DatabaseSync } from 'node:sqlite';
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
};

function basenameOf(ref: string): string {
  const cleaned = ref.replace(/[\\/]+$/, '');
  const slash = Math.max(cleaned.lastIndexOf('/'), cleaned.lastIndexOf('\\'));
  const tail = slash >= 0 ? cleaned.slice(slash + 1) : cleaned;
  const stripped = tail.replace(/^v/, '').replace(/\.git$/, '');
  const atIdx = stripped.lastIndexOf('@');
  const base = atIdx > 0 ? stripped.slice(0, atIdx) : stripped;
  return base || 'package';
}

function manifestToInstall(manifest: PackageManifest, projectId: string) {
  return {
    projectId,
    source: manifest.name,
    name: manifest.name,
    version: manifest.version,
    installPath: `.agents/packages/${manifest.name}@${manifest.version}`,
    trusted: manifest.trusted,
    enabled: true,
    manifest,
  };
}

export function createPackageService(
  db: DatabaseSync,
  deps: PackageServiceDeps,
): PackageService {
  const packages: PackagesRepository =
    deps.packages ?? createPackagesRepository(db);
  const eventStore = deps.eventStore;

  return {
    async resolve(source) {
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
      const rec = packages.create(manifestToInstall(input.manifest, projectId));
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
      packages.update(packageId, { trusted: true });
    },

    async remove(packageId) {
      packages.delete(packageId);
    },

    async setEnabled(packageId, enabled) {
      const rec = packages.getById(packageId);
      if (!rec) throw new Error(`package not found: ${packageId}`);
      packages.update(packageId, { enabled });
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
