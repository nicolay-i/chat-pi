import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './server';
import { createDb } from './db';
import { CreateProjectInputSchema, CapabilitiesSchema } from '@pi-agents/contracts';
import { createChatsRepository } from './db/repositories/chatsRepository';
import { createProjectsRepository } from './db/repositories/projectsRepository';
import { createTasksRepository } from './db/repositories/tasksRepository';
import { createEventsRepository } from './db/repositories/eventsRepository';
import { createPiSessionsRepository } from './db/repositories/piSessionsRepository';
import { createCheckpointsRepository } from './db/repositories/checkpointsRepository';
import { FakePiRuntime } from './services/piRuntimeService';
import { TemporaryGitRepository } from './test/harness/TemporaryGitRepository';
import { FixedWindowRateLimiter } from './app/rateLimiter';

const app = createApp(createDb(':memory:'));

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
    expect(typeof body.time).toBe('string');
  });
});

describe('app lifecycle', () => {
  it('disposes the injected Pi runtime', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    const runtime = Object.assign(new FakePiRuntime(), { dispose });
    const disposableApp = createApp(createDb(':memory:'), { taskRuntime: runtime });

    await disposableApp.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('CORS policy', () => {
  it('allows only configured origins in production', async () => {
    const productionApp = createApp(createDb(':memory:'), {
      corsPolicy: { nodeEnv: 'production', corsOrigins: ['https://chat.tailnet.ts.net'] },
    });

    const allowed = await productionApp.request('/api/capabilities', {
      headers: { origin: 'https://chat.tailnet.ts.net' },
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://chat.tailnet.ts.net');

    const denied = await productionApp.request('/api/capabilities', {
      headers: { origin: 'https://untrusted.example' },
    });
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('responds to allowed CORS preflight requests', async () => {
    const productionApp = createApp(createDb(':memory:'), {
      corsPolicy: { nodeEnv: 'production', corsOrigins: ['http://100.116.45.50:8092'] },
    });
    const response = await productionApp.request('/api/chats/bootstrap', {
      method: 'OPTIONS',
      headers: {
        origin: 'http://100.116.45.50:8092',
        'access-control-request-method': 'POST',
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://100.116.45.50:8092');
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });
});

describe('request body limit', () => {
  it('rejects a payload larger than the configured limit', async () => {
    const limitedApp = createApp(createDb(':memory:'), { maxBodyBytes: 8 });
    const response = await limitedApp.request('/api/chats/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'too large' }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ code: 'payload_too_large' });
  });
});

describe('GET /api/capabilities', () => {
  it('returns capability flags', async () => {
    const res = await app.request('/api/capabilities');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.supportsWorktrees).toBe(true);
    expect(body.supportsSse).toBe(true);
  });

  it('matches the Capabilities contract', async () => {
    const res = await app.request('/api/capabilities');
    const body = await res.json();
    expect(() => CapabilitiesSchema.parse(body)).not.toThrow();
  });
});

describe('GET /api/projects', () => {
  it('returns an empty array when db is fresh', async () => {
    const res = await app.request('/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});

describe('POST /api/chats/bootstrap', () => {
  it('creates and reuses a local chat', async () => {
    const first = await app.request('/api/chats/bootstrap', { method: 'POST' });
    expect(first.status).toBe(201);
    const firstChat = await first.json();
    expect(firstChat.id).toBeTruthy();
    expect(firstChat.mode).toBe('discussion');

    const second = await app.request('/api/chats/bootstrap', { method: 'POST' });
    expect(second.status).toBe(201);
    const secondChat = await second.json();
    expect(secondChat.id).toBe(firstChat.id);
  });
});

describe('POST /api/chats/:id/abort', () => {
  it('delegates to the chat runtime command and persists its realtime event', async () => {
    const abort = async (chatId: string, emit: (type: 'run.aborted', payload: unknown) => void) => {
      emit('run.aborted', { chatId, reason: 'user' });
    };
    const testApp = createApp(createDb(':memory:'), {
      chatRuntime: {
        send: async () => undefined,
        abort,
      },
    });
    const created = await testApp.request('/api/chats/bootstrap', { method: 'POST' });
    const chat = await created.json();

    const res = await testApp.request(`/api/chats/${chat.id}/abort`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const events = await testApp.request(`/api/chats/${chat.id}/events`);
    const reader = events.body!.getReader();
    const first = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(first.value)).toContain('run.aborted');
  });
});

describe('chat lifecycle endpoints', () => {
  it('updates, traces, exports and archives persisted chats', async () => {
    const db = createDb(':memory:');
    const app = createApp(db);
    const created = await app.request('/api/chats/bootstrap', { method: 'POST' });
    const chat = await created.json();

    const updated = await app.request(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed chat' }),
    });
    expect(updated.status).toBe(200);
    expect((await updated.json()).title).toBe('Renamed chat');

    const events = createEventsRepository(db);
    events.append({ projectId: chat.projectId, chatId: chat.id, source: 'chat', type: 'run.completed', payload: { ok: true } });
    const trace = await app.request(`/api/chats/${chat.id}/trace`);
    expect(trace.status).toBe(200);
    expect(await trace.json()).toHaveLength(1);

    const exported = await app.request(`/api/chats/${chat.id}/export`, { method: 'POST' });
    expect(exported.status).toBe(200);
    expect((await exported.json()).url).toMatch(/^data:application\/json/);

    const archived = await app.request(`/api/chats/${chat.id}/archive`, { method: 'POST' });
    expect(archived.status).toBe(200);
    const list = await app.request(`/api/projects/${chat.projectId}/chats`);
    expect(await list.json()).toEqual([]);
  });
});

describe('project file endpoints', () => {
  it('lists, reads, writes and searches only inside the project repository', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(':memory:');
    try {
      writeFileSync(join(repo.repoPath, 'notes.md'), '# Notes\nfind this text\n');
      const project = createProjectsRepository(db).create({
        name: 'files', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath,
      });
      const app = createApp(db);

      const listed = await app.request(`/api/projects/${project.id}/files`);
      expect(listed.status).toBe(200);
      expect((await listed.json()).some((item: { path: string }) => item.path === 'notes.md')).toBe(true);

      const content = await app.request(`/api/projects/${project.id}/files/content?path=notes.md`);
      expect(content.status).toBe(200);
      expect((await content.json()).content).toContain('find this text');

      const written = await app.request(`/api/projects/${project.id}/files/content`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: 'nested/new.txt', content: 'saved', size: 5, encoding: 'utf8' }),
      });
      expect(written.status).toBe(200);
      expect((await written.json()).path).toBe('nested/new.txt');

      const searched = await app.request(`/api/projects/${project.id}/files/search`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'find this' }),
      });
      expect(searched.status).toBe(200);
      expect(await searched.json()).toMatchObject([{ path: 'notes.md', line: 2 }]);

      const traversal = await app.request(`/api/projects/${project.id}/files/content?path=..%2Fpackage.json`);
      expect(traversal.status).toBe(400);
    } finally {
      repo.dispose();
    }
  });
});

describe('quick action endpoints', () => {
  it('lists static actions and keeps a completed action run available by id', async () => {
    const app = createApp(createDb(':memory:'));
    const listed = await app.request('/api/projects/project-1/actions');
    expect(listed.status).toBe(200);
    expect((await listed.json()).some((action: { id: string }) => action.id === 'run-tests')).toBe(true);
    const run = await app.request('/api/actions/run-tests/run', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { scope: 'unit' } }) });
    expect(run.status).toBe(200);
    const body = await run.json();
    const loaded = await app.request(`/api/action-runs/${body.id}`);
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({ id: body.id, actionId: 'run-tests', status: 'completed' });
  });
});

describe('provider endpoints', () => {
  it('persists provider metadata while never returning a raw secret', async () => {
    const app = createApp(createDb(':memory:'));
    const created = await app.request('/api/projects/project-1/providers', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'openai', baseUrl: 'https://api.example.test/v1', hasSecret: true, models: [{ id: 'model-1', label: 'Model 1' }] }),
    });
    expect(created.status).toBe(201);
    const provider = await created.json();
    expect(provider).toMatchObject({ type: 'openai', hasSecret: true });
    expect(JSON.stringify(provider)).not.toContain('pending-secret-configuration');
    const tested = await app.request(`/api/projects/project-1/providers/${provider.id}/test`, { method: 'POST' });
    expect(await tested.json()).toMatchObject({ ok: true, modelsFound: ['model-1'] });
  });
});

describe('package endpoints', () => {
  it('resolves, installs, trusts and removes project packages', async () => {
    const repository = new TemporaryGitRepository();
    try {
      const sourcePath = join(repository.root, 'local-package');
      mkdirSync(join(sourcePath, 'extensions'), { recursive: true });
      writeFileSync(join(sourcePath, 'extensions', 'package.mjs'), 'export default {};\n');
      writeFileSync(join(sourcePath, 'pi-package.json'), JSON.stringify({
        name: 'example-package', version: '1.0.0', trusted: false,
        resources: { extensions: ['package.mjs'], skills: [], prompts: [], themes: [], providers: [] },
      }));
      const app = createApp(createDb(':memory:'));
      const projectResponse = await app.request('/api/projects', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'package test', repoPath: repository.repoPath, defaultBranch: 'main' }),
      });
      const { id: projectId } = await projectResponse.json() as { id: string };
      const source = { kind: 'local', ref: sourcePath };
      const resolved = await app.request(`/api/projects/${projectId}/packages/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(source) });
      expect(resolved.status).toBe(200);
      const resolution = await resolved.json();
      const installed = await app.request(`/api/projects/${projectId}/packages/install`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source, manifest: { ...resolution.manifest, trusted: false } }) });
      expect(installed.status).toBe(201);
      const install = await installed.json();
      expect(install.status).toBe('pending_trust');
      const trusted = await app.request(`/api/projects/${projectId}/packages/${install.installId}/trust`, { method: 'POST' });
      expect((await trusted.json()).manifest.trusted).toBe(true);
      const removed = await app.request(`/api/projects/${projectId}/packages/${install.installId}`, { method: 'DELETE' });
      expect(await removed.json()).toEqual({ ok: true });
    } finally {
      repository.dispose();
    }
  });

  it('rate limits package resolution and sends a retry hint', async () => {
    const app = createApp(createDb(':memory:'), {
      rateLimiter: new FixedWindowRateLimiter(1, 60_000),
    });
    const request = () => app.request('/api/projects/project-1/packages/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'npm', ref: '@scope/example-package' }),
    });

    expect((await request()).status).toBe(200);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    expect(await limited.json()).toMatchObject({ code: 'rate_limited', retryable: true });
  });

  it('uses the direct remote address as the client key unless proxy trust is enabled', async () => {
    const app = createApp(createDb(':memory:'), {
      rateLimiter: new FixedWindowRateLimiter(1, 60_000),
    });
    const request = (address: string) => app.fetch(
      new Request('http://api.test/api/projects/project-1/packages/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.200' },
        body: JSON.stringify({ kind: 'npm', ref: '@scope/example-package' }),
      }),
      { incoming: { socket: { remoteAddress: address } } } as never,
    );

    expect((await request('198.51.100.1')).status).toBe(200);
    expect((await request('198.51.100.1')).status).toBe(429);
    expect((await request('198.51.100.2')).status).toBe(200);
  });
});

describe('skill endpoints', () => {
  it('lists and runs a project skill from the active catalog', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(':memory:');
    try {
      const skillDir = join(repo.repoPath, '.agents', 'skills', 'verify');
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(join(skillDir, 'SKILL.md'), '# Verify\n\nVerify the result.\n');
      const project = createProjectsRepository(db).create({ name: 'skills', repoPath: repo.repoPath, defaultBranch: 'main', agentsDir: '.agents', runtimeStatePath: repo.runtimePath });
      const app = createApp(db);
      const listed = await app.request(`/api/projects/${project.id}/skills`);
      const skills = await listed.json();
      expect(skills[0].id).toBe('verify');
      const tested = await app.request(`/api/projects/${project.id}/skills/verify/test`, { method: 'POST' });
      expect(await tested.json()).toEqual({ ok: true });
    } finally { repo.dispose(); }
  });
});

describe('prompt endpoints', () => {
  it('seeds, saves and reloads project-scoped prompt templates', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(':memory:');
    try {
      const project = createProjectsRepository(db).create({ name: 'prompts', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath });
      const app = createApp(db);
      const listed = await app.request(`/api/projects/${project.id}/prompts`);
      const initial = await listed.json();
      expect(initial.some((item: { id: string }) => item.id === 'discussion')).toBe(true);
      const saved = await app.request(`/api/projects/${project.id}/prompts/discussion`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'discussion', name: 'Discussion', mode: 'discussion', body: 'Answer {question}', variables: ['question'] }) });
      expect(saved.status).toBe(200);
      const reloaded = await app.request(`/api/projects/${project.id}/prompts`);
      expect((await reloaded.json()).find((item: { id: string }) => item.id === 'discussion')).toMatchObject({ body: 'Answer {question}' });
    } finally { repo.dispose(); }
  });
});

describe('implementation chat runtime', () => {
  it('uses the task worktree/session and publishes run events to chat SSE', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(':memory:');
    try {
      const worktreePath = repo.createWorktree('task-1');
      const project = createProjectsRepository(db).create({
        name: 'implementation', repoPath: repo.repoPath, defaultBranch: 'main', runtimeStatePath: repo.runtimePath,
      });
      const chat = createChatsRepository(db).create({
        projectId: project.id, title: 'Implement', mode: 'implementation', activeTaskId: 'task-1',
      });
      createTasksRepository(db).create({
        id: 'task-1', projectId: project.id, sourceChatId: chat.id, title: 'Implement', mode: 'implementation',
        status: 'idle', baseBranch: 'main', baseSha: repo.mainHead, branchName: 'agents/task-1',
        worktreePath, piSessionPath: `${repo.runtimePath}/sessions/task-1.jsonl`, mergeTarget: 'main',
      });
      const runtime = new FakePiRuntime();
      const app = createApp(db, { taskRuntime: runtime });

      const res = await app.request(`/api/chats/${chat.id}/messages`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'change file', behavior: 'send' }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, taskId: 'task-1' });

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(runtime.lastPreparedSession).toEqual({
        sessionId: 'task-1', cwd: worktreePath, sessionPath: `${repo.runtimePath}/sessions/task-1.jsonl`, resourceRoot: repo.repoPath, agentsDir: '.agents',
      });
      const events = createEventsRepository(db);
      expect(events.listByTask('task-1').map((event) => event.type)).toContain('run.completed');
      expect(events.listByTask('task-1').map((event) => event.type)).toContain('checkpoint.created');
      expect(events.listByTask('task-1').map((event) => event.type)).toContain('task.status.changed');
      expect(events.listByChat(chat.id).map((event) => event.type)).toContain('run.completed');
      expect(events.listByChat(chat.id).map((event) => event.type)).toContain('checkpoint.created');
      expect(createCheckpointsRepository(db).listByTask('task-1')).toHaveLength(1);
      expect(createTasksRepository(db).getById('task-1')?.status).toBe('needs_review');
      expect(createPiSessionsRepository(db).getByTaskId('task-1')).toMatchObject({
        path: `${repo.runtimePath}/sessions/task-1.jsonl`, cwd: worktreePath,
      });

      const trace = await app.request('/api/tasks/task-1/trace');
      expect(trace.status).toBe(200);
      expect((await trace.json()).some((event: { type: string }) => event.type === 'run.completed')).toBe(true);

      const fork = await app.request('/api/tasks/task-1/fork', { method: 'POST' });
      expect(fork.status).toBe(201);
      expect((await fork.json()).id).not.toBe('task-1');

      const rollback = await app.request('/api/tasks/task-1/rollback', { method: 'POST' });
      expect(rollback.status).toBe(201);
      expect((await rollback.json()).id).not.toBe('task-1');
      expect(createTasksRepository(db).getById('task-1')?.status).toBe('archived');
    } finally {
      repo.dispose();
    }
  });
});

describe('implementation milestone over public API', () => {
  it('runs two isolated tasks, checkpoints both, then merges one and stales its sibling', async () => {
    const repo = new TemporaryGitRepository();
    const db = createDb(':memory:');
    class WritingRuntime extends FakePiRuntime {
      readonly prepared = new Map<string, { cwd: string; sessionPath: string }>();

      override async prepare(session: Parameters<FakePiRuntime['prepare']>[0]): Promise<void> {
        this.prepared.set(session.sessionId, { cwd: session.cwd, sessionPath: session.sessionPath });
        await super.prepare(session);
      }

      override async prompt(sessionId: string, input: Parameters<FakePiRuntime['prompt']>[1]): Promise<void> {
        const session = this.prepared.get(sessionId);
        if (!session) throw new Error(`missing runtime context for ${sessionId}`);
        writeFileSync(join(session.cwd, `${sessionId}.txt`), `${input.text}\n`);
        await super.prompt(sessionId, input);
      }
    }
    const runtime = new WritingRuntime();
    const api = createApp(db, { taskRuntime: runtime });
    const postJson = (path: string, body: unknown) => api.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const waitForStatus = async (taskId: string, status: string): Promise<void> => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const response = await api.request(`/api/tasks/${taskId}`);
        const task = await response.json() as { status: string };
        if (task.status === status) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`task ${taskId} did not reach ${status}`);
    };

    try {
      const projectResponse = await postJson('/api/projects', {
        name: 'milestone',
        repoPath: repo.repoPath,
        defaultBranch: 'main',
      });
      expect(projectResponse.status).toBe(201);
      const project = await projectResponse.json() as { id: string };
      expect(createProjectsRepository(db).getById(project.id)?.runtimeStatePath).toBe(join(repo.root, 'repo.pi-runtime'));

      const createTaskChat = async (title: string) => {
        const response = await postJson(`/api/projects/${project.id}/chats`, {
          title,
          mode: 'implementation',
          createTask: true,
        });
        expect(response.status).toBe(201);
        return response.json() as Promise<{ id: string; activeTaskId: string }>;
      };
      const [firstChat, secondChat] = await Promise.all([
        createTaskChat('first implementation'),
        createTaskChat('second implementation'),
      ]);

      const send = (chatId: string, text: string) => postJson(`/api/chats/${chatId}/messages`, {
        text,
        behavior: 'send',
      });
      const [firstRun, secondRun] = await Promise.all([
        send(firstChat.id, 'first change'),
        send(secondChat.id, 'second change'),
      ]);
      expect(firstRun.status).toBe(200);
      expect(secondRun.status).toBe(200);

      await Promise.all([
        waitForStatus(firstChat.activeTaskId, 'needs_review'),
        waitForStatus(secondChat.activeTaskId, 'needs_review'),
      ]);

      const firstRuntime = runtime.prepared.get(firstChat.activeTaskId);
      const secondRuntime = runtime.prepared.get(secondChat.activeTaskId);
      expect(firstRuntime).toBeDefined();
      expect(secondRuntime).toBeDefined();
      expect(firstRuntime!.cwd).not.toBe(secondRuntime!.cwd);
      expect(firstRuntime!.sessionPath).not.toBe(secondRuntime!.sessionPath);
      expect(firstRuntime!.cwd).not.toBe(repo.repoPath);
      expect(secondRuntime!.cwd).not.toBe(repo.repoPath);

      for (const taskId of [firstChat.activeTaskId, secondChat.activeTaskId]) {
        const checkpoints = await api.request(`/api/tasks/${taskId}/checkpoints`);
        expect(checkpoints.status).toBe(200);
        expect(await checkpoints.json()).toHaveLength(1);
        const trace = await api.request(`/api/tasks/${taskId}/trace`);
        expect((await trace.json()).some((event: { type: string }) => event.type === 'run.completed')).toBe(true);
      }

      const merged = await postJson(`/api/tasks/${firstChat.activeTaskId}/merge`, {
        strategy: 'squash',
        commitMessage: 'agent: merge first task',
      });
      expect(merged.status, JSON.stringify(await merged.json())).toBe(200);

      const firstTask = await (await api.request(`/api/tasks/${firstChat.activeTaskId}`)).json() as { status: string };
      const secondTask = await (await api.request(`/api/tasks/${secondChat.activeTaskId}`)).json() as { status: string };
      expect(firstTask.status).toBe('merged');
      expect(secondTask.status).toBe('stale');
    } finally {
      await api.dispose();
      repo.dispose();
    }
  }, 15_000);
});

describe('POST /api/projects', () => {
  it('creates a project and returns 201', async () => {
    const input = CreateProjectInputSchema.parse({
      name: 'demo',
      repoPath: '/repos/demo',
      defaultBranch: 'main',
    });
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('demo');
  });
});

describe('app.onError', () => {
  it('returns an ApiError-shaped response when a route throws', async () => {
    const res = await app.request('/__throws');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({
      code: 'internal_error',
      message: 'boom',
      retryable: false,
    });
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
  });
});
