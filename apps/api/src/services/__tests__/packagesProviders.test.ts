import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import type { PackageManifest } from '@pi-agents/contracts';
import { createDb } from '../../db';
import { createProjectsRepository } from '../../db';
import { createEventStore } from '../../realtime/eventStore';
import { createProjectService } from '../projectService';
import { createPackageService } from '../packageService';
import { createProviderService } from '../providerService';
import { createActionEngine } from '../actionEngine';
import { createSkillRunner } from '../skillRunner';
import { TemporaryGitRepository } from '../../test/harness/TemporaryGitRepository';

async function setup() {
  const db: DatabaseSync = createDb(':memory:');
  const eventStore = createEventStore(db);
  const projects = createProjectService(db);
  const repository = new TemporaryGitRepository();
  const packages = createPackageService(db, { eventStore, projects: createProjectsRepository(db) });
  const providers = createProviderService(db, { eventStore });
  const actions = createActionEngine(db);
  const skills = createSkillRunner(db, { projects: createProjectsRepository(db) });
  const project = await projects.create({
    name: 'p',
    repoPath: repository.repoPath,
    defaultBranch: 'main',
  });
  return {
    db,
    eventStore,
    project,
    packages,
    providers,
    actions,
    skills,
    repository,
  };
}

let env: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  env = await setup();
});

afterEach(() => {
  env.repository.dispose();
});

function createLocalPackage(name: string, resources: PackageManifest['resources']): string {
  const path = join(env.repository.root, 'package-sources', name);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'pi-package.json'), JSON.stringify({
    name,
    version: '1.2.3',
    description: `Fixture ${name}`,
    resources,
    trusted: false,
  }, null, 2));
  if (resources.extensions.length > 0) {
    mkdirSync(join(path, 'extensions'), { recursive: true });
    writeFileSync(join(path, 'extensions', 'extension.mjs'), 'export default {};\n');
  }
  if (resources.skills.length > 0) {
    for (const skill of resources.skills) {
      mkdirSync(join(path, 'skills', skill), { recursive: true });
      writeFileSync(join(path, 'skills', skill, 'SKILL.md'), `# ${skill}\n`);
    }
  }
  return path;
}

describe('packageService', () => {
  it('resolve returns a manifest with resources', async () => {
    const manifest = await env.packages.resolve({
      kind: 'npm',
      ref: '@scope/my-pkg',
    });
    expect(manifest.name).toBe('my-pkg');
    expect(manifest.version).toBe('0.0.0');
    expect(manifest.trusted).toBe(false);
    expect(manifest.resources.extensions.length).toBeGreaterThan(0);
    expect(manifest.resources.skills.length).toBeGreaterThan(0);
  });

  it('install creates a pending_trust row (trusted=false) and emits event', async () => {
    const manifest = await env.packages.resolve({
      kind: 'git',
      ref: 'github.com/x/y',
    });
    const result = await env.packages.install(env.project.id, {
      source: { kind: 'git', ref: 'github.com/x/y' },
      manifest,
    });
    expect(result.status).toBe('pending_trust');
    expect(result.manifest).toBeDefined();
    const list = await env.packages.list(env.project.id);
    expect(list.length).toBe(1);
    expect(list[0].trusted).toBe(false);
    expect(list[0].enabled).toBe(true);
  });

  it('listLoadableExtensions excludes untrusted packages', async () => {
    const source = createLocalPackage('pkg', {
      extensions: ['ext-a', 'ext-b'], skills: [], prompts: [], themes: [], providers: [],
    });
    const manifest = await env.packages.resolve({
      kind: 'local',
      ref: source,
    });
    manifest.resources.extensions = ['ext-a', 'ext-b'];
    const result = await env.packages.install(env.project.id, {
      source: { kind: 'local', ref: source },
      manifest,
    });
    const before = await env.packages.listLoadableExtensions(env.project.id);
    expect(before.extensions).toEqual([]);
    await env.packages.trust(result.installId);
    const after = await env.packages.listLoadableExtensions(env.project.id);
    expect(after.extensions).toEqual(['ext-a', 'ext-b']);
    expect(after.sources).toEqual([manifest.name, manifest.name]);
  });

  it('listLoadableExtensions excludes disabled-but-trusted packages', async () => {
    const source = createLocalPackage('pkg2', {
      extensions: ['ext-x'], skills: [], prompts: [], themes: [], providers: [],
    });
    const manifest = await env.packages.resolve({
      kind: 'local',
      ref: source,
    });
    manifest.resources.extensions = ['ext-x'];
    const result = await env.packages.install(env.project.id, {
      source: { kind: 'local', ref: source },
      manifest,
    });
    await env.packages.trust(result.installId);
    await env.packages.setEnabled(result.installId, false);
    const loadable = await env.packages.listLoadableExtensions(env.project.id);
    expect(loadable.extensions).toEqual([]);
    expect(JSON.parse(readFileSync(join(env.project.repoPath, '.agents', 'packages.lock.json'), 'utf8'))).toMatchObject({
      packages: [],
    });
  });

  it('trust toggles the trusted flag', async () => {
    const source = createLocalPackage('toggleme', {
      extensions: [], skills: [], prompts: [], themes: [], providers: [],
    });
    const manifest = await env.packages.resolve({
      kind: 'local',
      ref: source,
    });
    const result = await env.packages.install(env.project.id, {
      source: { kind: 'local', ref: source },
      manifest,
    });
    await env.packages.trust(result.installId);
    const list = await env.packages.list(env.project.id);
    expect(list[0].trusted).toBe(true);
    expect(existsSync(join(env.project.repoPath, '.agents', 'packages', 'toggleme@1.2.3', 'pi-package.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(env.project.repoPath, '.agents', 'packages.lock.json'), 'utf8'))).toMatchObject({
      version: 1,
      packages: [{ name: 'toggleme', version: '1.2.3', installPath: '.agents/packages/toggleme@1.2.3' }],
    });
  });

  it('materializes a scoped local package under a filesystem-safe directory name', async () => {
    const source = createLocalPackage('@scope/plugin', {
      extensions: [], skills: [], prompts: [], themes: [], providers: [],
    });
    const manifest = await env.packages.resolve({ kind: 'local', ref: source });
    const result = await env.packages.install(env.project.id, {
      source: { kind: 'local', ref: source },
      manifest,
    });

    await env.packages.trust(result.installId);

    const safeDirectory = '%40scope%2Fplugin@1.2.3';
    expect(existsSync(join(env.project.repoPath, '.agents', 'packages', safeDirectory, 'pi-package.json'))).toBe(true);
    expect(JSON.parse(readFileSync(join(env.project.repoPath, '.agents', 'packages.lock.json'), 'utf8'))).toMatchObject({
      packages: [{ name: '@scope/plugin', installPath: `.agents/packages/${safeDirectory}` }],
    });
  });

  it('remove deletes the package', async () => {
    const manifest = await env.packages.resolve({
      kind: 'npm',
      ref: 'gone',
    });
    const result = await env.packages.install(env.project.id, {
      source: { kind: 'npm', ref: 'gone' },
      manifest,
    });
    await env.packages.remove(result.installId);
    expect(await env.packages.list(env.project.id)).toEqual([]);
  });
});

describe('providerService', () => {
  it('create stores the secret ref; list returns hasSecret but no raw ref', async () => {
    const created = await env.providers.create(env.project.id, {
      name: 'ollama',
      type: 'openai',
      baseUrl: 'https://x',
      secretRef: 'secret:ollama-key',
      models: [{ id: 'm1', label: 'M1' }],
    });
    expect(created.hasSecret).toBe(true);
    expect(JSON.stringify(created)).not.toContain('ollama-key');
    expect(JSON.stringify(created)).not.toContain('secret:');
    const list = await env.providers.list(env.project.id);
    expect(list.length).toBe(1);
    expect(list[0].hasSecret).toBe(true);
    const serialized = JSON.stringify(list);
    expect(serialized).not.toContain('secret:');
    expect(serialized).not.toContain('ollama-key');
  });

  it('rejects a raw provider secret before it reaches SQLite', async () => {
    await expect(env.providers.create(env.project.id, {
      name: 'raw-key',
      type: 'openai',
      secretRef: 'sk-live-this-must-not-be-persisted',
    })).rejects.toThrow(/symbolic env: or secret: reference/);

    const stored = env.db.prepare('SELECT secret_ref FROM providers WHERE project_id = ?').all(env.project.id);
    expect(JSON.stringify(stored)).not.toContain('sk-live-this-must-not-be-persisted');
  });

  it('list provider carries models but no secretRef field', async () => {
    await env.providers.create(env.project.id, {
      name: 'p2',
      type: 'anthropic',
      models: [{ id: 'a1', label: 'A1' }],
    });
    const [provider] = await env.providers.list(env.project.id);
    expect(provider.models).toEqual([{ id: 'a1', label: 'A1' }]);
    expect((provider as Record<string, unknown>).secretRef).toBeUndefined();
    expect((provider as Record<string, unknown>).secret_ref).toBeUndefined();
  });

  it('test returns a ProviderTestResult', async () => {
    const created = await env.providers.create(env.project.id, {
      name: 'p3',
      type: 'custom',
      models: [{ id: 'm', label: 'M' }],
    });
    const result = await env.providers.test(created.id);
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.modelsFound)).toBe(true);
    expect(result.modelsFound).toContain('m');
  });

  it('setEnabled / remove work', async () => {
    const created = await env.providers.create(env.project.id, {
      name: 'p4',
      type: 'openai',
    });
    await env.providers.setEnabled(created.id, false);
    await env.providers.remove(created.id);
    expect(await env.providers.list(env.project.id)).toEqual([]);
  });
});

describe('actionEngine', () => {
  it('listActions returns the catalog', async () => {
    const actions = await env.actions.listActions(env.project.id);
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('commit');
    expect(ids).toContain('run-tests');
    expect(ids).toContain('merge');
    expect(ids).toContain('revert');
  });

  it('context filters actions; needs_review shows commit+merge', async () => {
    const actions = await env.actions.listActions(env.project.id, {
      taskStatus: 'needs_review',
      hasDiff: true,
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('commit');
    expect(ids).toContain('merge');
    expect(ids).toContain('run-tests');
  });

  it('runAction returns a completed ActionRun', async () => {
    const run = await env.actions.runAction('commit', { foo: 1 });
    expect(run.actionId).toBe('commit');
    expect(run.status).toBe('completed');
    expect(run.createdAt).toBeDefined();
    expect((run.result as Record<string, unknown>).foo).toBeUndefined();
    expect(
      (run.result as { input: Record<string, unknown> }).input.foo,
    ).toBe(1);
  });
});

describe('skillRunner', () => {
  it('listSkills includes the 2 default skills', async () => {
    const list = await env.skills.listSkills(env.project.id);
    const ids = list.map((s) => s.id);
    expect(ids).toContain('update-implementation-state');
    expect(ids).toContain('verify-subagent-output');
  });

  it('listSkills includes package skills only from trusted+enabled', async () => {
    const source = createLocalPackage('skillpkg', {
      extensions: [], skills: ['extra-skill'], prompts: [], themes: [], providers: [],
    });
    const manifest = await env.packages.resolve({
      kind: 'local',
      ref: source,
    });
    manifest.resources.skills = ['extra-skill'];
    const result = await env.packages.install(env.project.id, {
      source: { kind: 'local', ref: source },
      manifest,
    });
    const before = await env.skills.listSkills(env.project.id);
    expect(before.every((s) => s.source !== 'package')).toBe(true);
    await env.packages.trust(result.installId);
    const after = await env.skills.listSkills(env.project.id);
    const pkgSkills = after.filter((s) => s.source === 'package');
    expect(pkgSkills.length).toBe(1);
    expect(pkgSkills[0].id.endsWith('extra-skill')).toBe(true);
  });

  it('runSkill returns ok', async () => {
    const res = await env.skills.runSkill('update-implementation-state');
    expect(res.ok).toBe(true);
    expect(res.output).toContain('update-implementation-state');
  });
});
