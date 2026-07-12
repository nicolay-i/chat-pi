import { ApiClient, ApiClientError } from '../client';

function mockResponse(body, init) {
  const ok = init?.ok ?? true;
  return {
    ok,
    status: init?.status ?? (ok ? 200 : 500),
    statusText: init?.statusText ?? (ok ? 'OK' : 'Internal Server Error'),
    json: async () => body,
  };
}

describe('ApiClient', () => {
  let originalFetch;
  let fetchMock;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('getProjects returns parsed array on 200', async () => {
    fetchMock.mockResolvedValue(
      mockResponse([
        {
          id: 'project-1',
          name: 'Demo',
          repoPath: '/repo',
          defaultBranch: 'main',
          agentsDir: '.agents',
          activeTaskCount: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]),
    );

    const client = new ApiClient('https://api.example.com');
    const projects = await client.getProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('project-1');
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/projects');
  });

  it('getProjects throws ApiClientError on 500', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ code: 'internal_error', message: 'boom', retryable: false }, { ok: false, status: 500 }),
    );

    const client = new ApiClient('https://api.example.com');
    await expect(client.getProjects()).rejects.toBeInstanceOf(ApiClientError);

    try {
      await client.getProjects();
    } catch (e) {
      if (e instanceof ApiClientError) {
        expect(e.code).toBe('internal_error');
        expect(e.message).toBe('boom');
        expect(e.retryable).toBe(false);
      }
    }
  });

  it('sendMessage posts the body and returns { ok: true }', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true, accepted: 'send' }));

    const client = new ApiClient('https://api.example.com');
    const result = await client.sendMessage('chat-1', { text: 'hello', behavior: 'send' });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/chats/chat-1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello', behavior: 'send' }),
    });
  });

  it('sendMessage forwards attachments through the updated schema', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true, accepted: 'send' }));

    const client = new ApiClient('https://api.example.com');
    const input = {
      text: 'see image',
      behavior: 'send',
      attachments: [{ id: 'a1', kind: 'image', uri: 'file:///x.png' }],
    };
    const result = await client.sendMessage('chat-1', input);

    expect(result).toEqual({ ok: true });
    const call = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(call[1].body);
    expect(sentBody.attachments).toEqual([{ id: 'a1', kind: 'image', uri: 'file:///x.png' }]);
  });

  it('abortChat posts to the chat runtime command endpoint', async () => {
    fetchMock.mockResolvedValue(mockResponse({ ok: true }));

    const client = new ApiClient('https://api.example.com');
    await expect(client.abortChat('chat-1')).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/chats/chat-1/abort', {
      method: 'POST',
    });
  });

  it('revertFile sends the explicit confirmation accepted by the task route', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      id: 'task-1', projectId: 'project-1', title: 'Task', mode: 'implementation', status: 'idle',
      branchName: 'agents/task-1', worktreePath: '/repo/.worktrees/task-1', changedFiles: 0, updatedAt: '2026-01-01T00:00:00.000Z',
    }));

    const client = new ApiClient('https://api.example.com');
    await client.revertFile('task-1', { path: 'src/app.ts', confirm: true });

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/api/tasks/task-1/revert-file', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'src/app.ts', confirm: true }),
    });
  });

  it('toError normalizes an error body into ApiClientError', async () => {
    fetchMock.mockResolvedValue(
      mockResponse({ code: 'HTTP_ERROR', message: 'Internal Server Error' }, { ok: false }),
    );

    const client = new ApiClient('https://api.example.com');
    await expect(client.getProject('p-1')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'HTTP_ERROR',
    });
  });
});
