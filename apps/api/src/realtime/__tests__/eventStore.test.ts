import { describe, it, expect, beforeEach } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { DatabaseSync as RawDatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDb } from '../../db';
import { createProjectsRepository } from '../../db/repositories/projectsRepository';
import { createChatsRepository } from '../../db/repositories/chatsRepository';
import { createTasksRepository } from '../../db/repositories/tasksRepository';
import {
  createEventStore,
  streamKey,
  type EventStore,
} from '../eventStore';
import { formatSseEvent, toSseResponse } from '../sse';
import { createApp } from '../../server';
import type { RealtimeEnvelope } from '@pi-agents/contracts';

function seedProject(db: DatabaseSync): string {
  return createProjectsRepository(db).create({
    name: 'p',
    repoPath: '/r',
    defaultBranch: 'main',
    runtimeStatePath: '.pi/runtime.json',
  }).id;
}

function appendChat(
  store: EventStore,
  projectId: string,
  chatId: string,
  type: RealtimeEnvelope['type'] = 'message.created',
  payload: unknown = { hi: true },
): Promise<RealtimeEnvelope> {
  return store.append({
    stream: 'chat',
    streamId: chatId,
    projectId,
    chatId,
    type,
    payload,
  });
}

describe('eventStore.append + stream', () => {
  let db: DatabaseSync;
  let store: EventStore;
  let projectId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    projectId = seedProject(db);
    store = createEventStore(db);
  });

  it('persists and returns the event with RealtimeEnvelope shape; stream replays it', async () => {
    const env = await appendChat(store, projectId, 'chat-1', 'message.created', { n: 1 });

    expect(env.id).toBeTruthy();
    expect(env.stream).toBe('chat');
    expect(env.streamId).toBe('chat-1');
    expect(env.type).toBe('message.created');
    expect(env.payload).toEqual({ n: 1 });
    expect(typeof env.createdAt).toBe('string');

    const replayed = store.stream('chat', 'chat-1');
    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toEqual(env);
  });

  it('isolates streams: 3 to chat A, 2 to chat B', async () => {
    await appendChat(store, projectId, 'A', undefined, { n: 1 });
    await appendChat(store, projectId, 'A', undefined, { n: 2 });
    await appendChat(store, projectId, 'A', undefined, { n: 3 });
    await appendChat(store, projectId, 'B', undefined, { n: 4 });
    await appendChat(store, projectId, 'B', undefined, { n: 5 });

    expect(store.stream('chat', 'A')).toHaveLength(3);
    expect(store.stream('chat', 'B')).toHaveLength(2);
  });

  it('preserves append order across interleaved streams', async () => {
    const a1 = await appendChat(store, projectId, 'A');
    const b1 = await appendChat(store, projectId, 'B');
    const a2 = await appendChat(store, projectId, 'A');

    expect(store.stream('chat', 'A').map((e) => e.id)).toEqual([a1.id, a2.id]);
    expect(store.stream('chat', 'B').map((e) => e.id)).toEqual([b1.id]);
  });

  it('keeps a cursor scoped to each stream when sequences are interleaved', async () => {
    const a1 = await appendChat(store, projectId, 'A');
    await appendChat(store, projectId, 'B');
    const a2 = await appendChat(store, projectId, 'A');

    expect(store.stream('chat', 'A', a1.sequence).map((event) => event.id)).toEqual([a2.id]);
    expect(store.stream('chat', 'B', a1.sequence)).toHaveLength(1);
  });

  it('afterSequence returns ONLY the strict tail (SSE resume semantics)', async () => {
    const e1 = await appendChat(store, projectId, 'A');
    const e2 = await appendChat(store, projectId, 'A');
    const e3 = await appendChat(store, projectId, 'A');

    expect(store.stream('chat', 'A', e2.sequence).map((e) => e.id)).toEqual([e3.id]);
    expect(store.stream('chat', 'A', e3.sequence)).toHaveLength(0);
    expect(store.stream('chat', 'A', e1.sequence).map((e) => e.id)).toEqual([
      e2.id,
      e3.id,
    ]);
  });

  it('streamKey builds a stable composite key', () => {
    expect(streamKey('chat', 'c1')).toBe('chat:c1');
    expect(streamKey('task', 't9')).toBe('task:t9');
    expect(streamKey('project', 'p2')).toBe('project:p2');
  });
});

describe('event sequence persistence', () => {
  it('continues with a higher sequence after reopening a database', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pi-agents-events-'));
    const path = join(directory, 'events.db');
    try {
      const firstDb = createDb(path);
      const projectId = seedProject(firstDb);
      const first = await appendChat(createEventStore(firstDb), projectId, 'chat-1');
      firstDb.close();

      const secondDb = createDb(path);
      const second = await appendChat(createEventStore(secondDb), projectId, 'chat-1');
      secondDb.close();

      expect(second.sequence).toBeGreaterThan(first.sequence);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('migrates a legacy chat_events table without a sequence column', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pi-agents-legacy-'));
    const path = join(directory, 'legacy.db');
    try {
      const legacy = new RawDatabaseSync(path);
      legacy.exec(`CREATE TABLE chat_events (
        id text primary key, project_id text not null, chat_id text, task_id text,
        pi_session_id text, source text not null, type text not null,
        payload_json text not null, created_at text not null
      );`);
      legacy.exec(`INSERT INTO chat_events VALUES ('legacy-1', 'p1', 'c1', null, null, 'chat', 'message.created', '{}', '2026-01-01T00:00:00.000Z');`);
      legacy.close();

      const db = createDb(path);
      const events = createEventStore(db).stream('chat', 'c1');
      db.close();
      expect(events[0].sequence).toBe(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('eventStore pub/sub', () => {
  let db: DatabaseSync;
  let store: EventStore;
  let projectId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    projectId = seedProject(db);
    store = createEventStore(db);
  });

  it('fires onChange for appends to the subscribed stream only', async () => {
    const seen: RealtimeEnvelope[] = [];
    store.subscribe('chat', 'A', undefined, (env) => seen.push(env));

    await appendChat(store, projectId, 'A', undefined, { n: 1 });
    await appendChat(store, projectId, 'B', undefined, { n: 2 });
    await appendChat(store, projectId, 'A', undefined, { n: 3 });

    expect(seen.map((e) => e.streamId)).toEqual(['A', 'A']);
    expect(seen.map((e) => (e.payload as { n: number }).n)).toEqual([1, 3]);
  });

  it('unsubscribe stops delivery of subsequent appends', async () => {
    const seen: RealtimeEnvelope[] = [];
    const unsubscribe = store.subscribe('chat', 'A', undefined, (env) =>
      seen.push(env),
    );

    await appendChat(store, projectId, 'A', undefined, { n: 1 });
    unsubscribe();
    await appendChat(store, projectId, 'A', undefined, { n: 2 });

    expect(seen).toHaveLength(1);
  });

  it('does NOT redeliver already-seen events when resuming with afterSequence (duplicate-safe)', async () => {
    const e1 = await appendChat(store, projectId, 'A');
    const e2 = await appendChat(store, projectId, 'A');
    const e3 = await appendChat(store, projectId, 'A');

    const liveAfter2: RealtimeEnvelope[] = [];
    store.subscribe('chat', 'A', e2.sequence, (env) => liveAfter2.push(env));

    expect(store.stream('chat', 'A', e2.sequence).map((e) => e.id)).toEqual([e3.id]);

    const e4 = await appendChat(store, projectId, 'A');
    expect(liveAfter2.map((e) => e.id)).toEqual([e4.id]);
  });
});

describe('formatSseEvent', () => {
  it('produces a single SSE data line terminated by blank line', () => {
    const env: RealtimeEnvelope = {
      id: 'evt-1',
      sequence: 1,
      stream: 'chat',
      streamId: 'c1',
      type: 'message.created',
      payload: { hi: 1 },
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const out = formatSseEvent(env);
    expect(out).toBe(`data: ${JSON.stringify(env)}\n\n`);
    expect(out.endsWith('\n\n')).toBe(true);
  });
});

describe('SSE HTTP integration (createApp)', () => {
  let db: DatabaseSync;
  let projectId: string;
  let chatId: string;
  let taskId: string;

  beforeEach(() => {
    db = createDb(':memory:');
    projectId = seedProject(db);
    chatId = createChatsRepository(db).create({
      projectId,
      title: 'c',
      mode: 'discussion',
    }).id;
    taskId = createTasksRepository(db).create({
      projectId,
      title: 't',
      mode: 'implementation',
      status: 'created',
      baseBranch: 'main',
      baseSha: 'abc',
      branchName: 'pi/t',
      worktreePath: '/wt/t',
      piSessionPath: '.pi/sessions/t',
      mergeTarget: 'main',
    }).id;
  });

  async function readSseChunks(
    res: Response,
    minDataLines: number,
    maxReads = 8,
  ): Promise<string> {
    expect(res.body).toBeTruthy();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    try {
      for (let i = 0; i < maxReads; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        if ((text.match(/^data: /gm) || []).length >= minDataLines) break;
      }
    } finally {
      await reader.cancel();
    }
    return text;
  }

  it('GET /api/chats/:id/events streams replayed events as SSE', async () => {
    const events = createEventStore(db);
    const e1 = await appendChat(events, projectId, chatId, undefined, { n: 1 });
    const e2 = await appendChat(events, projectId, chatId, undefined, { n: 2 });

    const app = createApp(db);
    const res = await app.request(`/api/chats/${chatId}/events`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(res.headers.get('x-accel-buffering')).toBe('no');

    const body = await readSseChunks(res, 2);
    expect(body).toContain(`data: ${JSON.stringify(e1)}`);
    expect(body).toContain(`data: ${JSON.stringify(e2)}`);
  });

  it('GET /api/chats/:id/events?afterSequence=N replays only the strict tail', async () => {
    const events = createEventStore(db);
    const e1 = await appendChat(events, projectId, chatId, undefined, { n: 1 });
    const e2 = await appendChat(events, projectId, chatId, undefined, { n: 2 });
    const e3 = await appendChat(events, projectId, chatId, undefined, { n: 3 });

    const app = createApp(db);
    const res = await app.request(
      `/api/chats/${chatId}/events?afterSequence=${e2.sequence}`,
    );

    expect(res.status).toBe(200);
    const body = await readSseChunks(res, 1);
    expect(body).not.toContain(e1.id);
    expect(body).not.toContain(e2.id);
    expect(body).toContain(e3.id);
  });

  it('rejects an invalid afterSequence cursor', async () => {
    const app = createApp(db);
    const res = await app.request(`/api/chats/${chatId}/events?afterSequence=not-a-number`);
    expect(res.status).toBe(400);
  });

  it('POST /api/chats/:id/messages appends an event visible to SSE replay (round-trip)', async () => {
    const app = createApp(db);
    const postRes = await app.request(`/api/chats/${chatId}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello', behavior: 'send' }),
    });
    expect(postRes.status).toBe(200);

    const res = await app.request(`/api/chats/${chatId}/events`);
    const body = await readSseChunks(res, 1);
    expect(body).toContain('message.created');
    expect(body).toContain('"text":"hello"');
  });

  it('GET /api/tasks/:id/events and /api/projects/:id/events serve SSE too', async () => {
    const app = createApp(db);

    const taskRes = await app.request(`/api/tasks/${taskId}/events`);
    expect(taskRes.status).toBe(200);
    expect(taskRes.headers.get('content-type')).toBe('text/event-stream');
    expect(taskRes.headers.get('cache-control')).toBe('no-cache');
    expect(taskRes.body).toBeTruthy();
    await taskRes.body!.cancel();

    const projRes = await app.request(`/api/projects/${projectId}/events`);
    expect(projRes.status).toBe(200);
    expect(projRes.headers.get('content-type')).toBe('text/event-stream');
    expect(projRes.body).toBeTruthy();
    await projRes.body!.cancel();
  });
});

describe('toSseResponse unit', () => {
  it('writes replay then live events and cleans up on cancel', async () => {
    const replay: RealtimeEnvelope[] = [
      {
        id: 'r1',
        sequence: 1,
        stream: 'chat',
        streamId: 'c1',
        type: 'message.created',
        payload: { i: 1 },
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    let unsubbed = false;
    const res = toSseResponse({
      replay,
      subscribe: (onChange) => {
        return () => {
          unsubbed = true;
        };
      },
    });

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const first = decoder.decode(value);
    expect(first).toBe(`data: ${JSON.stringify(replay[0])}\n\n`);
    await reader.cancel();
    expect(unsubbed).toBe(true);
  });
});
