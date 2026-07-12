import type { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { runGit } from './gitExec';

const BACKUP_VERSION = 1;
const EXCLUDED_DIRECTORY_NAMES = new Set(['.git', 'node_modules']);
const EXCLUDED_FILE_NAMES = new Set(['auth.json', 'credentials.json', 'secrets.json']);
const EXCLUDED_FILE_SUFFIXES = ['.key', '.pem', '.p12', '.p8', '.mobileprovision'];
const AGENT_PATHS = ['skills', 'prompts', 'extensions', 'packages', 'packages.lock.json', 'providers.json', 'mcp.json'];
const RUNTIME_PATHS = ['sessions', 'prompts.json', 'theme.json'];

export type BackupProject = {
  id: string;
  repoPath: string;
  agentsDir: string;
  runtimeStatePath: string;
};

type BackupFile = { path: string; sha256: string; size: number };

export type BackupManifest = {
  version: number;
  createdAt: string;
  files: BackupFile[];
  projects: Array<{ id: string; gitRefsPath: string }>;
};

function isWithin(basePath: string, targetPath: string): boolean {
  const relativePath = relative(basePath, targetPath);
  return relativePath === '' || (!relativePath.startsWith(`..${sep}`) && relativePath !== '..');
}

function isSafeEntry(name: string, isDirectory: boolean): boolean {
  if (isDirectory) return !EXCLUDED_DIRECTORY_NAMES.has(name);
  if (name.startsWith('.env') || EXCLUDED_FILE_NAMES.has(name)) return false;
  return !EXCLUDED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

async function copySafe(source: string, destination: string): Promise<void> {
  const sourceStat = await stat(source);
  if (!isSafeEntry(source.split(/[\\/]/).at(-1) ?? '', sourceStat.isDirectory())) return;

  if (!sourceStat.isDirectory()) {
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
    return;
  }

  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (!isSafeEntry(entry.name, entry.isDirectory())) continue;
    await copySafe(join(source, entry.name), join(destination, entry.name));
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(root: string, current = root): Promise<BackupFile[]> {
  const collected: BackupFile[] = [];
  if (!await exists(current)) return collected;
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const filePath = join(current, entry.name);
    if (entry.isDirectory()) {
      collected.push(...await collectFiles(root, filePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const contents = await readFile(filePath);
    collected.push({
      path: relative(root, filePath).replaceAll('\\', '/'),
      sha256: createHash('sha256').update(contents).digest('hex'),
      size: contents.byteLength,
    });
  }
  return collected;
}

async function assertEmptyDirectory(path: string): Promise<void> {
  if (!await exists(path)) {
    await mkdir(path, { recursive: true });
    return;
  }
  if ((await readdir(path)).length > 0) throw new Error(`Backup target must be empty: ${path}`);
}

function sqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export type CreateBackupInput = {
  db: DatabaseSync;
  projects: BackupProject[];
  destination: string;
};

export async function createBackup(input: CreateBackupInput): Promise<BackupManifest> {
  const destination = resolve(input.destination);
  await assertEmptyDirectory(destination);
  const databasePath = join(destination, 'database.sqlite');
  input.db.exec(`VACUUM INTO ${sqliteString(databasePath)}`);

  const projects: BackupManifest['projects'] = [];
  for (const project of input.projects) {
    const projectRoot = join(destination, 'projects', project.id);
    const agentRoot = resolve(project.repoPath, project.agentsDir);
    if (!isWithin(resolve(project.repoPath), agentRoot)) throw new Error(`Invalid agents path for project ${project.id}`);
    if (isWithin(resolve(project.repoPath), destination) || isWithin(resolve(project.runtimeStatePath), destination)) {
      throw new Error(`Backup destination must not be inside project sources: ${project.id}`);
    }

    for (const agentPath of AGENT_PATHS) {
      const source = join(agentRoot, agentPath);
      if (await exists(source)) await copySafe(source, join(projectRoot, 'agents', agentPath));
    }
    for (const runtimePath of RUNTIME_PATHS) {
      const source = join(project.runtimeStatePath, runtimePath);
      if (await exists(source)) await copySafe(source, join(projectRoot, 'runtime', runtimePath));
    }

    const gitRefsPath = `projects/${project.id}/git-refs.txt`;
    const gitRefs = runGit(['for-each-ref', '--format=%(refname) %(objectname)'], { cwd: project.repoPath }).stdout;
    await mkdir(dirname(join(destination, gitRefsPath)), { recursive: true });
    await writeFile(join(destination, gitRefsPath), `${gitRefs}\n`, 'utf8');
    projects.push({ id: project.id, gitRefsPath });
  }

  const files = await collectFiles(destination);
  const manifest: BackupManifest = { version: BACKUP_VERSION, createdAt: new Date().toISOString(), files, projects };
  await writeFile(join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

export async function restoreBackup(source: string, destination: string): Promise<BackupManifest> {
  const sourceRoot = resolve(source);
  const targetRoot = resolve(destination);
  const manifest = JSON.parse(await readFile(join(sourceRoot, 'manifest.json'), 'utf8')) as BackupManifest;
  if (manifest.version !== BACKUP_VERSION) throw new Error(`Unsupported backup version: ${manifest.version}`);
  await assertEmptyDirectory(targetRoot);

  for (const file of manifest.files) {
    const sourcePath = resolve(sourceRoot, file.path);
    if (!isWithin(sourceRoot, sourcePath)) throw new Error(`Invalid backup path: ${file.path}`);
    const contents = await readFile(sourcePath);
    const sha256 = createHash('sha256').update(contents).digest('hex');
    if (sha256 !== file.sha256) throw new Error(`Backup integrity check failed: ${file.path}`);
  }

  for (const file of [...manifest.files, { path: 'manifest.json' }]) {
    const sourcePath = resolve(sourceRoot, file.path);
    const destinationPath = resolve(targetRoot, file.path);
    if (!isWithin(targetRoot, destinationPath)) throw new Error(`Invalid restore path: ${file.path}`);
    await mkdir(dirname(destinationPath), { recursive: true });
    await cp(sourcePath, destinationPath);
  }
  return manifest;
}
