import { act, render, waitFor } from '@testing-library/react-native';
import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { RootStoreProvider } from '@/providers/RootStoreProvider';
import { createRootStore, type RootStore } from '@/stores/rootStore';

jest.mock('@/navigation', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    Link: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
    useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
  };
});

import ProjectDashboardScreen from '../index';

const project = {
  id: 'project-demo',
  name: 'Demo project',
  repoPath: 'C:/repo',
  defaultBranch: 'main',
  agentsDir: '.agents',
  activeTaskCount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const tasks = ['task-a', 'task-b'].map((id) => ({
  id,
  projectId: 'project-demo',
  title: id,
  mode: 'implementation' as const,
  status: 'running' as const,
  branchName: `task/${id}`,
  worktreePath: `C:/repo/.worktrees/${id}`,
  changedFiles: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
}));

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

describe('ProjectDashboardScreen', () => {
  const originalFetch = globalThis.fetch;
  let store: RootStore | null = null;

  afterEach(() => {
    store?.dispose();
    store = null;
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('shows an active task count that follows TaskStore realtime updates', async () => {
    const streams: Array<{ url: string; onEvent: (event: RealtimeEnvelope) => void }> = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/projects/project-demo')) return response(project);
      if (url.endsWith('/api/projects/project-demo/chats')) return response([]);
      if (url.endsWith('/api/projects/project-demo/tasks')) return response(tasks);
      throw new Error(`Unexpected request ${url}`);
    }) as typeof fetch;
    store = createRootStore({
      realtimeFactory: (options) => {
        streams.push({ url: options.url, onEvent: options.onEvent });
        return { start: jest.fn(), stop: jest.fn() };
      },
      storage: { load: async () => 'https://backend.example', save: async () => undefined, clear: async () => undefined },
    });
    store.backend.setBaseUrl('https://backend.example');
    const screen = await render(
      <RootStoreProvider store={store}>
        <ProjectDashboardScreen />
      </RootStoreProvider>,
    );

    expect(await screen.findByText('2 active tasks')).toBeTruthy();
    const taskAStream = streams.find((stream) => stream.url.endsWith('/api/tasks/task-a/events'));
    expect(taskAStream).toBeDefined();

    await act(async () => taskAStream?.onEvent({
      id: 'task-a-idle',
      sequence: 1,
      stream: 'task',
      streamId: 'task-a',
      type: 'task.status.changed',
      payload: { status: 'idle' },
      createdAt: '2026-01-01T00:01:00.000Z',
    }));

    await waitFor(() => expect(screen.getByText('1 active task')).toBeTruthy());
  });
});
