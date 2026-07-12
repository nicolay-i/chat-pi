import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPiSessionBranch, updatePiSessionCwd } from '../piSessionBranch';

const roots: string[] = [];

function jsonl(path: string): Array<Record<string, unknown>> {
  return readFileSync(path, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('Pi session branch files', () => {
  it('copies only checkpoint ancestry with a distinct session id and target cwd', () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-branch-'));
    roots.push(root);
    const sourcePath = join(root, 'source.jsonl');
    const destinationPath = join(root, 'nested', 'branch.jsonl');
    writeFileSync(sourcePath, [
      JSON.stringify({ type: 'session', version: 3, id: 'source', timestamp: '2026-07-12T00:00:00.000Z', cwd: '/worktrees/source' }),
      JSON.stringify({ type: 'message', id: 'one', parentId: null, timestamp: '2026-07-12T00:00:01.000Z', message: { role: 'user', content: 'one' } }),
      JSON.stringify({ type: 'message', id: 'two', parentId: 'one', timestamp: '2026-07-12T00:00:02.000Z', message: { role: 'assistant', content: 'two' } }),
      JSON.stringify({ type: 'message', id: 'later', parentId: 'two', timestamp: '2026-07-12T00:00:03.000Z', message: { role: 'user', content: 'later' } }),
    ].join('\n'), 'utf8');

    expect(createPiSessionBranch({ sourcePath, destinationPath, leafEntryId: 'two', cwd: '/worktrees/branch' })).toBe(true);

    const entries = jsonl(destinationPath);
    expect(entries[0]).toMatchObject({ type: 'session', cwd: '/worktrees/branch', parentSession: sourcePath });
    expect(entries[0].id).not.toBe('source');
    expect(entries.map((entry) => entry.id)).toEqual(expect.arrayContaining(['one', 'two']));
    expect(entries.some((entry) => entry.id === 'later')).toBe(false);
  });

  it('updates only the native session header cwd before reopening it', () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-cwd-'));
    roots.push(root);
    const sessionPath = join(root, 'session.jsonl');
    writeFileSync(sessionPath, [
      JSON.stringify({ type: 'session', version: 3, id: 'source', timestamp: '2026-07-12T00:00:00.000Z', cwd: '/old' }),
      JSON.stringify({ type: 'message', id: 'one', parentId: null, timestamp: '2026-07-12T00:00:01.000Z', message: { role: 'user', content: 'one' } }),
    ].join('\n'), 'utf8');

    expect(updatePiSessionCwd(sessionPath, '/new')).toBe(true);
    expect(jsonl(sessionPath)).toEqual([
      expect.objectContaining({ type: 'session', cwd: '/new' }),
      expect.objectContaining({ id: 'one' }),
    ]);
  });
});
