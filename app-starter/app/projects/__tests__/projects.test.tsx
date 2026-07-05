import { act } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from 'expo-router';
import ProjectsScreen from '../../projects';

type FetchImpl = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const originalFetch = globalThis.fetch;

const setFetch = (fn: FetchImpl): void => {
  (globalThis as { fetch: FetchImpl }).fetch = fn;
};

const restoreFetch = (): void => {
  (globalThis as { fetch: FetchImpl }).fetch = originalFetch;
};

const jsonRes = (body: unknown): Response =>
  ({ ok: true, json: async () => body }) as unknown as Response;

const errRes = (status: number, message: string): Response =>
  ({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ code: 'HTTP_ERROR', message, retryable: false }),
  }) as unknown as Response;

const PROJECT = {
  id: 'project-demo',
  name: 'pi.dev workspace',
  repoPath: '/var/lib/agents/projects/pi-dev/repo',
  defaultBranch: 'main',
  agentsDir: '.agents',
  activeTaskCount: 3,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function configureBackend(url: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

describe('ProjectsScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(
        () => new Promise<Response>(() => {}),
      ),
    );

    const { getByTestId } = await render(<ProjectsScreen />);
    expect(getByTestId('projects.loading')).toBeTruthy();
  });

  it('renders loaded list with project name', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/api/projects')) return jsonRes([PROJECT]);
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(fetchMock);

    const { findByTestId, getByText } = await render(<ProjectsScreen />);
    expect(await findByTestId('projects.list')).toBeTruthy();
    expect(getByText(PROJECT.name)).toBeTruthy();
  });

  it('renders empty state with CTA when no projects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));

    const { findByTestId } = await render(<ProjectsScreen />);
    expect(await findByTestId('projects.empty')).toBeTruthy();
    expect(await findByTestId('projects.empty.cta')).toBeTruthy();
  });

  it('renders error state with retry when fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));

    const { findByTestId, findByText } = await render(<ProjectsScreen />);
    expect(await findByTestId('projects.error')).toBeTruthy();
    expect(await findByText(/network down/)).toBeTruthy();
  });

  it('opens new-project screen on CTA tap', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));

    const { findByTestId } = await render(<ProjectsScreen />);
    const cta = await findByTestId('projects.empty.cta');
    await act(async () => {
      fireEvent.press(cta);
    });
    expect(router.push).toHaveBeenCalledWith('/projects/new');
  });
});
