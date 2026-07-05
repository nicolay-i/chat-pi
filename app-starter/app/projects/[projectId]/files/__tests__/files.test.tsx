import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import FilesScreen from '../../files';

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
  const mod = require('@/state/backendStore') as typeof import('@/state/backendStore');
  mod.backendActions.setBaseUrl(url);
}

const TREE = [
  { path: 'README.md', type: 'file', size: 120 },
  { path: 'src', type: 'dir', childrenCount: 1 },
  { path: 'src/index.ts', type: 'file', size: 40 },
];

const SEARCH_RESULTS = [
  { path: 'README.md', line: 3, preview: 'hello world', matchCount: 1 },
  { path: 'src/index.ts', line: 10, preview: 'export const hello', matchCount: 1 },
];

describe('FilesScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders loading state initially', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => new Promise<Response>(() => {})));
    const { getByTestId } = await render(<FilesScreen />);
    expect(getByTestId('files.loading')).toBeTruthy();
  });

  it('renders tree with dir and file rows', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes(TREE)));
    const { findByTestId } = await render(<FilesScreen />);
    expect(await findByTestId('files.tree')).toBeTruthy();
    expect(await findByTestId('files.row.src')).toBeTruthy();
    expect(await findByTestId('files.row.src_index.ts')).toBeTruthy();
    expect(await findByTestId('files.row.README.md')).toBeTruthy();
  });

  it('renders empty state when no files', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));
    const { findByTestId } = await render(<FilesScreen />);
    expect(await findByTestId('files.empty')).toBeTruthy();
  });

  it('renders error state with retry when fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('network down'))));
    const { findByTestId, findByText } = await render(<FilesScreen />);
    expect(await findByTestId('files.error')).toBeTruthy();
    expect(await findByText(/network down/)).toBeTruthy();
  });

  it('shows search results with preview when query is typed', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/files/search')) {
        const body = init && init.body ? JSON.parse(String(init.body)) : {};
        if (body.query === 'hello') return jsonRes(SEARCH_RESULTS);
        return jsonRes([]);
      }
      return jsonRes(TREE);
    });
    setFetch(fetchMock);

    const { getByTestId, findByTestId } = await render(<FilesScreen />);
    await findByTestId('files.tree');

    const input = getByTestId('files.search');
    await act(async () => {
      fireEvent.changeText(input, 'hello');
    });

    expect(await findByTestId('files.results')).toBeTruthy();
    expect(await findByTestId('files.result.0')).toBeTruthy();
    expect(await findByTestId('files.result.1')).toBeTruthy();
  });
});
