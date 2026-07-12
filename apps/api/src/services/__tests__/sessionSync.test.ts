import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, appendFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { createDb } from '../../db';
import { createProjectsRepository } from '../../db/repositories/projectsRepository';
import { createPiSessionsRepository } from '../../db/repositories/piSessionsRepository';
import { createEventStore } from '../../realtime/eventStore';
import {
  createSessionSyncService,
  SessionLockError,
} from '../sessionSyncService';
import { mapEntryToEvent, parseJsonl, type PiJsonlEntry } from '../piJsonl';

const tmpFiles: string[] = [];
function newTmpFile(label: string): string {
  const p = join(
    tmpdir(),
    `pi-sync-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}-${label}.jsonl`,
  );
  tmpFiles.push(p);
  return p;
}
function cleanupTmp(): void {
  for (const p of tmpFiles) {
    if (existsSync(p)) rmSync(p, { force: true });
  }
  tmpFiles.length = 0;
}

function entry(over: Partial<PiJsonlEntry> & { id: string }): PiJsonlEntry {
  return { ts: '2024-01-01T00:00:00.000Z', kind: 'message', ...over };
}

describe('parseJsonl', () => {
  it('parses 3 valid JSONL lines into 3 entries', () => {
    const text = [
      JSON.stringify(entry({ id: 'e1', kind: 'message', role: 'user', text: 'hi' })),
      JSON.stringify(entry({ id: 'e2', kind: 'tool_call', tool: 'ls' })),
      JSON.stringify(entry({ id: 'e3', kind: 'run', status: 'started' })),
    ].join('\n');
    const out = parseJsonl(text);
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.id)).toEqual(['e1', 'e2', 'e3']);
  });

  it('skips malformed and empty lines without throwing', () => {
    const text = [
      '',
      JSON.stringify(entry({ id: 'e1', kind: 'message' })),
      '{ not valid json',
      '',
      JSON.stringify(entry({ id: 'e2', kind: 'run' })),
    ].join('\n');
    const out = parseJsonl(text);
    expect(out.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('drops entries missing required id/ts/kind string fields', () => {
    const text = [
      JSON.stringify({ id: 'x', kind: 'message' }),
      JSON.stringify({ id: 'x', ts: '2024' }),
      JSON.stringify({ id: 'e1', ts: '2024', kind: 'message' }),
      JSON.stringify({ id: 'e2', ts: '2024', kind: 'run', status: 'started' }),
    ].join('\n');
    expect(parseJsonl(text).map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('normalizes native Pi SessionManager entries and excludes the session header', () => {
    const out = parseJsonl([
      JSON.stringify({ type: 'session', version: 3, id: 'session-1', timestamp: '2026-07-12T00:00:00.000Z', cwd: '/repo' }),
      JSON.stringify({ type: 'message', id: 'u1', parentId: null, timestamp: '2026-07-12T00:00:01.000Z', message: { role: 'user', content: 'hello' } }),
      JSON.stringify({ type: 'message', id: 'a1', parentId: 'u1', timestamp: '2026-07-12T00:00:02.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'world' }] } }),
      JSON.stringify({ type: 'compaction', id: 'c1', parentId: 'a1', timestamp: '2026-07-12T00:00:03.000Z', summary: 'compact context' }),
    ].join('\n'));

    expect(out).toEqual([
      expect.objectContaining({ id: 'u1', kind: 'message', role: 'user', text: 'hello', parent: undefined }),
      expect.objectContaining({ id: 'a1', kind: 'message', role: 'assistant', text: 'world', parent: 'u1' }),
      expect.objectContaining({ id: 'c1', kind: 'message', role: 'system', text: 'compact context', parent: 'a1' }),
    ]);
  });
});

describe('mapEntryToEvent', () => {
  const taskCtx = { projectId: 'p1', chatId: 'c1', taskId: 't1' };

  it('user/assistant message -> message.created (task stream, fresh id)', () => {
    const user = mapEntryToEvent(
      entry({ id: 'e1', kind: 'message', role: 'user', text: 'hello' }),
      taskCtx,
    );
    expect(user.type).toBe('message.created');
    expect(user.stream).toBe('task');
    expect(user.streamId).toBe('t1');
    expect(user.createdAt).toBe('2024-01-01T00:00:00.000Z');
    expect(user.id).not.toBe('e1');
    expect(user.payload).toEqual({ role: 'user', text: 'hello', id: 'e1' });

    const asst = mapEntryToEvent(
      entry({ id: 'e2', kind: 'message', role: 'assistant', text: 'hi' }),
      taskCtx,
    );
    expect(asst.type).toBe('message.created');
    expect((asst.payload as { role: string }).role).toBe('assistant');
  });

  it('tool_call -> tool.started, tool_result -> tool.completed', () => {
    const started = mapEntryToEvent(
      entry({ id: 'e1', kind: 'tool_call', tool: 'read_file', args: { path: 'a' } }),
      taskCtx,
    );
    expect(started.type).toBe('tool.started');
    expect(started.payload).toEqual({ tool: 'read_file', args: { path: 'a' } });

    const completed = mapEntryToEvent(
      entry({ id: 'e2', kind: 'tool_result', tool: 'read_file', output: 'data', status: 'ok' }),
      taskCtx,
    );
    expect(completed.type).toBe('tool.completed');
    expect(completed.payload).toEqual({ tool: 'read_file', output: 'data', status: 'ok' });
  });

  it('run started/completed/aborted and error -> run.*', () => {
    expect(
      mapEntryToEvent(entry({ id: 'e1', kind: 'run', status: 'started' }), taskCtx).type,
    ).toBe('run.started');
    expect(
      mapEntryToEvent(entry({ id: 'e2', kind: 'run', status: 'completed' }), taskCtx).type,
    ).toBe('run.completed');
    expect(
      mapEntryToEvent(entry({ id: 'e3', kind: 'run', status: 'aborted' }), taskCtx).type,
    ).toBe('run.aborted');

    const err = mapEntryToEvent(entry({ id: 'e4', kind: 'error', text: 'boom' }), taskCtx);
    expect(err.type).toBe('run.error');
    expect(err.payload).toEqual({ message: 'boom' });
  });

  it('checkpoint -> checkpoint.created; chat stream when no taskId', () => {
    const cp = mapEntryToEvent(
      entry({ id: 'e1', kind: 'checkpoint', text: 'sum' }),
      { projectId: 'p1', chatId: 'c1' },
    );
    expect(cp.type).toBe('checkpoint.created');
    expect(cp.stream).toBe('chat');
    expect(cp.streamId).toBe('c1');
    expect(cp.payload).toEqual({ id: 'e1', summary: 'sum' });
  });
});

describe('sessionSyncService.importSessionFile', () => {
  let db: DatabaseSync;
  let piSessionId: string;
  let filePath: string;
  let chatId: string;
  let piSessions: ReturnType<typeof createPiSessionsRepository>;
  let eventStore: ReturnType<typeof createEventStore>;
  let service: ReturnType<typeof createSessionSyncService>;

  beforeEach(() => {
    db = createDb(':memory:');
    const projectId = createProjectsRepository(db).create({
      name: 'p',
      repoPath: '/r',
      defaultBranch: 'main',
      runtimeStatePath: '.pi/r.json',
    }).id;
    chatId = 'chat-1';
    piSessions = createPiSessionsRepository(db);
    piSessionId = piSessions.create({
      projectId,
      chatId,
      path: '/s.jsonl',
      cwd: '/r',
    }).id;
    filePath = newTmpFile('session');
    eventStore = createEventStore(db);
    service = createSessionSyncService(db, { eventStore });
  });

  afterEach(() => {
    cleanupTmp();
  });

  function writeLines(lines: string[]): void {
    writeFileSync(filePath, lines.join('\n'), 'utf8');
  }

  it('imports 3 new entries (imported=3, skipped=0) and appends events', async () => {
    writeLines([
      JSON.stringify(entry({ id: 'e1', kind: 'message', role: 'user', text: 'a' })),
      JSON.stringify(entry({ id: 'e2', kind: 'tool_call', tool: 'ls' })),
      JSON.stringify(entry({ id: 'e3', kind: 'run', status: 'started' })),
    ]);
    const res = await service.importSessionFile({ piSessionId, filePath, owner: 'A' });
    expect(res.imported).toBe(3);
    expect(res.skipped).toBe(0);
    expect(res.newLastOffset).toBeGreaterThan(0);

    const events = eventStore.stream('chat', chatId);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual([
      'message.created',
      'tool.started',
      'run.started',
    ]);

    const updated = piSessions.getById(piSessionId);
    expect(updated?.lastEntryId).toBe('e3');
    expect(updated?.activeLeafEntryId).toBe('e3');
    expect(updated?.lastImportedOffset).toBe(res.newLastOffset);
  });

  it('re-import on the same file is idempotent (dedupe by entry id)', async () => {
    writeLines([
      JSON.stringify(entry({ id: 'e1', kind: 'message', role: 'user', text: 'a' })),
      JSON.stringify(entry({ id: 'e2', kind: 'tool_call', tool: 'ls' })),
      JSON.stringify(entry({ id: 'e3', kind: 'run', status: 'started' })),
    ]);
    await service.importSessionFile({ piSessionId, filePath, owner: 'A' });

    const r2 = await service.importSessionFile({ piSessionId, filePath, owner: 'A' });
    expect(r2.imported).toBe(0);
    expect(r2.skipped).toBe(3);
    expect(eventStore.stream('chat', chatId)).toHaveLength(3);
  });

  it('appending new entries imports only the new ones', async () => {
    writeLines([
      JSON.stringify(entry({ id: 'e1', kind: 'message', role: 'user', text: 'a' })),
      JSON.stringify(entry({ id: 'e2', kind: 'tool_call', tool: 'ls' })),
      JSON.stringify(entry({ id: 'e3', kind: 'run', status: 'started' })),
    ]);
    await service.importSessionFile({ piSessionId, filePath, owner: 'A' });

    appendFileSync(
      filePath,
      '\n' +
        [
          JSON.stringify(entry({ id: 'e4', kind: 'message', role: 'assistant', text: 'b' })),
          JSON.stringify(entry({ id: 'e5', kind: 'run', status: 'completed' })),
        ].join('\n'),
      'utf8',
    );

    const r3 = await service.importSessionFile({ piSessionId, filePath, owner: 'A' });
    expect(r3.imported).toBe(2);
    expect(r3.skipped).toBe(3);
    expect(eventStore.stream('chat', chatId)).toHaveLength(5);
  });

  it('malformed lines do not break import', async () => {
    writeLines([
      JSON.stringify(entry({ id: 'e1', kind: 'message', role: 'user', text: 'a' })),
      '{ broken json line',
      '',
      JSON.stringify(entry({ id: 'e2', kind: 'run', status: 'started' })),
    ]);
    const res = await service.importSessionFile({ piSessionId, filePath, owner: 'A' });
    expect(res.imported).toBe(2);
    expect(res.skipped).toBe(0);
    expect(eventStore.stream('chat', chatId)).toHaveLength(2);
  });

  it('lock conflict: import as B throws SessionLockError, import as A succeeds', async () => {
    writeLines([
      JSON.stringify(entry({ id: 'e1', kind: 'message', role: 'user', text: 'a' })),
    ]);
    expect(piSessions.acquireLock(piSessionId, 'A')).toBe(true);

    await expect(
      service.importSessionFile({ piSessionId, filePath, owner: 'B' }),
    ).rejects.toBeInstanceOf(SessionLockError);

    const res = await service.importSessionFile({ piSessionId, filePath, owner: 'A' });
    expect(res.imported).toBe(1);
    expect(eventStore.stream('chat', chatId)).toHaveLength(1);
  });
});
