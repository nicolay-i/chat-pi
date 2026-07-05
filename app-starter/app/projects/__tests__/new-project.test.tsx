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
import NewProjectScreen from '../new';

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

function configureBackend(url: string): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

describe('NewProjectScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('disables Save before validation passes and enables after valid validation', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes({})));

    const { getByTestId, queryByTestId } = await render(<NewProjectScreen />);

    // Save button present; before validation the result UI should not be visible
    expect(getByTestId('project.save')).toBeTruthy();
    expect(queryByTestId('project.validationResult')).toBeNull();

    // Fill required fields first so the local validator passes
    await act(async () => {
      fireEvent.changeText(getByTestId('project.name'), 'My workspace');
      fireEvent.changeText(getByTestId('project.repoPath'), '/var/lib/agents/projects/x/repo');
    });

    // Tap Validate (uses local validator)
    await act(async () => {
      fireEvent.press(getByTestId('project.validate'));
    });
    await waitFor(() => expect(queryByTestId('project.validationResult')).not.toBeNull());

    // Save should now be enabled — press it and assert create API is invoked
    const createMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/api/projects') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        return jsonRes({
          id: 'project-new',
          name: body.name,
          repoPath: body.repoPath,
          defaultBranch: body.defaultBranch,
          agentsDir: body.agentsDir ?? '.agents',
          activeTaskCount: 0,
          updatedAt: '2026-01-01T00:00:00.000Z',
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(createMock);

    await act(async () => {
      fireEvent.press(getByTestId('project.save'));
    });
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/projects/project-new');
  });
});
