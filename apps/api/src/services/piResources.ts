import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

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

/**
 * Pi normally discovers resources from the user's .pi directory. The app makes
 * each managed project's .agents directory explicit instead, so a new session
 * sees only the project-owned configuration.
 */
export function piResourceArgs(cwd: string | undefined, agentsDir = '.agents'): string[] {
  if (!cwd) return [];
  const root = resolve(cwd, agentsDir);
  if (!existsSync(root)) return [];

  const resourceRoots = [root];
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
