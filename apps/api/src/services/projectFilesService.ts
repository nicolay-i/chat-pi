import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, type Dirent } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { FileContent, FileNode, SearchResult } from '@pi-agents/contracts';
import type { ProjectsRepository } from '../db/repositories/projectsRepository';

const MAX_TREE_DEPTH = 6;
const MAX_SEARCH_FILE_BYTES = 1_000_000;
const MAX_SEARCH_RESULTS = 200;
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules']);

export class ProjectFileError extends Error {
  constructor(readonly code: 'not_found' | 'invalid_path' | 'invalid_content', message: string) {
    super(message);
  }
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}

function isText(buffer: Buffer): boolean {
  return !buffer.includes(0) && Buffer.from(buffer.toString('utf8'), 'utf8').equals(buffer);
}

export type ProjectFilesService = {
  list(projectId: string): FileNode[];
  read(projectId: string, path: string): FileContent;
  write(projectId: string, input: FileContent): FileContent;
  search(projectId: string, query: string): SearchResult[];
};

export function createProjectFilesService(projects: ProjectsRepository): ProjectFilesService {
  const rootFor = (projectId: string): string => {
    const project = projects.getById(projectId);
    if (!project) throw new ProjectFileError('not_found', 'project not found');
    const root = resolve(project.repoPath);
    if (!existsSync(root)) throw new ProjectFileError('not_found', 'project repository does not exist');
    return root;
  };

  const resolvePath = (root: string, requestedPath: string): string => {
    if (!requestedPath || isAbsolute(requestedPath)) {
      throw new ProjectFileError('invalid_path', 'path must be repository-relative');
    }
    const absolute = resolve(root, requestedPath);
    const rel = relative(root, absolute);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      throw new ProjectFileError('invalid_path', 'path escapes the project repository');
    }
    return absolute;
  };

  const nodeFor = (root: string, absolutePath: string, entry: Dirent, depth: number): FileNode => {
    const projectPath = toPosix(relative(root, absolutePath));
    if (entry.isDirectory()) {
      const children = depth < MAX_TREE_DEPTH ? readDirectory(root, absolutePath, depth + 1) : undefined;
      return { path: projectPath, type: 'dir', childrenCount: children?.length, children };
    }
    return { path: projectPath, type: 'file', size: statSync(absolutePath).size };
  };

  const readDirectory = (root: string, absolutePath: string, depth: number): FileNode[] => {
    return readdirSync(absolutePath, { withFileTypes: true })
      .filter((entry) => !entry.isDirectory() || !IGNORED_DIRECTORIES.has(entry.name))
      .sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1;
        return left.name.localeCompare(right.name);
      })
      .map((entry) => nodeFor(root, resolve(absolutePath, entry.name), entry, depth));
  };

  const collectFiles = (root: string, current = root): string[] => {
    const result: string[] = [];
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) result.push(...collectFiles(root, resolve(current, entry.name)));
      } else if (entry.isFile()) {
        result.push(resolve(current, entry.name));
      }
    }
    return result;
  };

  return {
    list(projectId) {
      const root = rootFor(projectId);
      return readDirectory(root, root, 0);
    },
    read(projectId, path) {
      const root = rootFor(projectId);
      const absolutePath = resolvePath(root, path);
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        throw new ProjectFileError('not_found', 'file not found');
      }
      const buffer = readFileSync(absolutePath);
      return isText(buffer)
        ? { path: toPosix(relative(root, absolutePath)), content: buffer.toString('utf8'), size: buffer.length, encoding: 'utf8' }
        : { path: toPosix(relative(root, absolutePath)), content: buffer.toString('base64'), size: buffer.length, encoding: 'base64' };
    },
    write(projectId, input) {
      const root = rootFor(projectId);
      const absolutePath = resolvePath(root, input.path);
      const buffer = input.encoding === 'base64' ? Buffer.from(input.content, 'base64') : Buffer.from(input.content, 'utf8');
      if (buffer.length !== input.size) {
        throw new ProjectFileError('invalid_content', 'size does not match the provided content');
      }
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, buffer);
      return this.read(projectId, input.path);
    },
    search(projectId, query) {
      const root = rootFor(projectId);
      const needle = query.trim().toLocaleLowerCase();
      if (!needle) return [];
      const results: SearchResult[] = [];
      for (const absolutePath of collectFiles(root)) {
        if (results.length >= MAX_SEARCH_RESULTS) break;
        const stats = statSync(absolutePath);
        if (stats.size > MAX_SEARCH_FILE_BYTES) continue;
        const buffer = readFileSync(absolutePath);
        if (!isText(buffer)) continue;
        const lines = buffer.toString('utf8').split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          const line = lines[index];
          const matches = line.toLocaleLowerCase().split(needle).length - 1;
          if (matches === 0) continue;
          results.push({ path: toPosix(relative(root, absolutePath)), line: index + 1, preview: line.slice(0, 500), matchCount: matches });
          if (results.length >= MAX_SEARCH_RESULTS) break;
        }
      }
      return results;
    },
  };
}
