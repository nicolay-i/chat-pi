import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type RawEntry = Record<string, unknown>;

function isRecord(value: unknown): value is RawEntry {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEntries(path: string): RawEntry[] {
  return readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      const parsed: unknown = JSON.parse(line);
      return isRecord(parsed) ? [parsed] : [];
    } catch {
      return [];
    }
  });
}

/**
 * Recreates Pi's persisted branch shape for a historical leaf. The new file
 * receives its own session id and only the ancestry that is valid for the
 * selected checkpoint; later branches remain in the source file untouched.
 */
export function createPiSessionBranch(input: {
  sourcePath: string;
  destinationPath: string;
  leafEntryId: string;
  cwd?: string;
}): boolean {
  if (!existsSync(input.sourcePath)) return false;
  const entries = parseEntries(input.sourcePath);
  const header = entries.find((entry) => entry.type === 'session');
  if (!header) return false;
  const byId = new Map(entries
    .filter((entry) => typeof entry.id === 'string' && entry.type !== 'session')
    .map((entry) => [entry.id as string, entry]));
  const branch: RawEntry[] = [];
  const seen = new Set<string>();
  let currentId: string | null = input.leafEntryId;
  while (currentId) {
    if (seen.has(currentId)) return false;
    seen.add(currentId);
    const current = byId.get(currentId);
    if (!current) return false;
    branch.unshift(current);
    currentId = typeof current.parentId === 'string' ? current.parentId : null;
  }

  let parentId: string | null = null;
  const withoutLabels: RawEntry[] = [];
  for (const entry of branch) {
    if (entry.type === 'label') continue;
    withoutLabels.push({ ...entry, parentId });
    parentId = entry.id as string;
  }
  const timestamp = new Date().toISOString();
  const branchedHeader: RawEntry = {
    ...header,
    id: crypto.randomUUID(),
    timestamp,
    cwd: input.cwd ?? header.cwd,
    parentSession: input.sourcePath,
  };
  mkdirSync(dirname(input.destinationPath), { recursive: true });
  writeFileSync(input.destinationPath, `${[branchedHeader, ...withoutLabels].map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
  return true;
}

/** Keeps a persisted Pi session aligned with the active runtime worktree. */
export function updatePiSessionCwd(sessionPath: string, cwd: string): boolean {
  if (!existsSync(sessionPath)) return false;
  const entries = parseEntries(sessionPath);
  const headerIndex = entries.findIndex((entry) => entry.type === 'session');
  if (headerIndex < 0) return false;
  entries[headerIndex] = { ...entries[headerIndex], cwd };
  writeFileSync(sessionPath, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`, 'utf8');
  return true;
}
