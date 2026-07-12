import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const EXTENSION_FILE_PATTERN = /\.(?:cjs|js|mjs|ts)$/i;

function filesRecursively(path: string): string[] {
  if (!existsSync(path)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) files.push(...filesRecursively(entryPath));
    else if (entry.isFile() && EXTENSION_FILE_PATTERN.test(entry.name)) files.push(entryPath);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function trustedPackageRoots(cwd: string, root: string): string[] {
  const lockPath = join(root, 'packages.lock.json');
  if (!existsSync(lockPath)) return [];
  try {
    const parsed = JSON.parse(readFileSync(lockPath, 'utf8')) as { packages?: Array<{ installPath?: string }> };
    const packagesRoot = resolve(root, 'packages');
    return (parsed.packages ?? [])
      .map((entry) => entry.installPath)
      .filter((path): path is string => typeof path === 'string')
      .map((path) => resolve(cwd, path))
      .filter((path) => {
        const pathWithinPackages = relative(packagesRoot, path);
        return pathWithinPackages !== '' && !pathWithinPackages.startsWith('..') && !pathWithinPackages.includes(':') && existsSync(path);
      })
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/**
 * Pi normally discovers resources from the user's .pi directory. The app makes
 * each managed project's .agents directory explicit instead, so a new session
 * sees only the project-owned configuration and trusted project extensions.
 */
export function piResourceArgs(cwd: string | undefined, agentsDir = '.agents'): string[] {
  if (!cwd) return [];
  const root = resolve(cwd, agentsDir);
  if (!existsSync(root)) return [];

  const resourceRoots = [root, ...trustedPackageRoots(cwd, root)];
  const args = ['--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes'];
  for (const resourceRoot of resourceRoots) {
    for (const extensionPath of filesRecursively(join(resourceRoot, 'extensions'))) {
      args.push('--extension', extensionPath);
    }
    const skills = join(resourceRoot, 'skills');
    if (existsSync(skills)) args.push('--skill', skills);
    const prompts = join(resourceRoot, 'prompts');
    if (existsSync(prompts)) args.push('--prompt-template', prompts);
    const themes = join(resourceRoot, 'themes');
    if (existsSync(themes)) args.push('--theme', themes);
  }
  return args;
}
