import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';

jest.mock('@/navigation', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from '@/navigation';
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
  const mod = require('@/test/rootStoreHarness') as typeof import('@/test/rootStoreHarness');
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
    fireEvent.changeText(getByTestId('project.name'), 'My workspace');
    await waitFor(() => expect(getByTestId('project.name').props.value).toBe('My workspace'));
    fireEvent.changeText(getByTestId('project.repoPath'), '/var/lib/agents/projects/x/repo');
    await waitFor(() => expect(getByTestId('project.repoPath').props.value).toBe('/var/lib/agents/projects/x/repo'));

    // Tap Validate (uses local validator)
    fireEvent.press(getByTestId('project.validate'));
    await waitFor(() => expect(queryByTestId('project.validationResult')).not.toBeNull());

    // Save should now be enabled — press it and assert create API is invoked
    let resolveCreate: ((response: Response) => void) | undefined;
    const createResponse = new Promise<Response>((resolve) => {
      resolveCreate = resolve;
    });
    let createRequestBody: string | undefined;
    const createMock = jest.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const u = typeof input === 'string' ? input : input.toString();
      if (u.endsWith('/api/projects') && init?.method === 'POST') {
        createRequestBody = String(init.body);
        return createResponse;
      }
      throw new Error(`unexpected fetch ${u}`);
    });
    setFetch(createMock);

    fireEvent.press(getByTestId('project.save'));
    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(JSON.parse(createRequestBody ?? '{}')).toMatchObject({
      name: 'My workspace',
      repoPath: '/var/lib/agents/projects/x/repo',
      defaultBranch: 'main',
    });
    await act(async () => {
      resolveCreate?.(jsonRes({
        id: 'project-new',
        name: 'My workspace',
        repoPath: '/var/lib/agents/projects/x/repo',
        defaultBranch: 'main',
        agentsDir: '.agents',
        activeTaskCount: 0,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }));
      await createResponse;
    });
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/projects/project-new');
      expect(getByTestId('project.save').props.disabled).not.toBe(true);
    });
  });
});
