import { act, fireEvent } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';

jest.mock('@/navigation', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import McpScreen from '../mcp';

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
  const mod = require('@/test/rootStoreHarness') as typeof import('@/test/rootStoreHarness');
  mod.backendActions.setBaseUrl(url);
}

const RAW_SECRET = 'sk-live-SUPER-SECRET-9876543210';

const SERVERS = [
  {
    id: 'filesystem',
    command: 'npx -y @modelcontextprotocol/server-filesystem',
    transport: 'stdio',
    env: {
      API_KEY: RAW_SECRET,
      NODE_ENV: 'production',
    },
    enabledPerMode: ['discussion', 'implementation'],
  },
];

describe('McpScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders the server list', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(SERVERS)));

    const { findByTestId, getByText } = await render(<McpScreen />);
    expect(await findByTestId('mcp.list')).toBeTruthy();
    expect(await findByTestId('mcp.item.filesystem')).toBeTruthy();
    expect(getByText('stdio')).toBeTruthy();
    expect(getByText(/modes:.*discussion.*implementation/)).toBeTruthy();
  });

  it('masks env secret values in display and never shows the raw secret', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(SERVERS)));

    const { findByTestId, getByText, queryByText } = await render(<McpScreen />);
    await findByTestId('mcp.item.filesystem');

    expect(getByText('API_KEY=<redacted>')).toBeTruthy();
    expect(getByText('NODE_ENV=production')).toBeTruthy();
    expect(queryByText(RAW_SECRET)).toBeNull();
  });

  it('test tools shows the result', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/mcp/') && url.endsWith('/test') && init?.method === 'POST') {
          return jsonRes({ ok: true });
        }
        return jsonRes(SERVERS);
      }),
    );

    const { findByTestId, findByText } = await render(<McpScreen />);
    await findByTestId('mcp.item.filesystem');

    const testBtn = await findByTestId('mcp.test.filesystem');
    await act(async () => {
      fireEvent.press(testBtn);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await findByText('Tools OK')).toBeTruthy();
  });
});
