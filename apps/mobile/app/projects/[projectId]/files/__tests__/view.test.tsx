
import { renderWithStore as render } from '@/test/renderWithStore';

const searchParams = { projectId: 'project-demo', path: 'docs/readme.md' };

jest.mock('@/navigation', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => searchParams),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import FileViewScreen from '../view';

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

function setPath(p: string): void {
  const mock = require('@/navigation').useLocalSearchParams as ReturnType<typeof jest.fn>;
  mock.mockImplementation(() => ({ projectId: 'project-demo', path: p }));
}

describe('FileViewScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
    setPath('docs/readme.md');
  });

  it('renders loading state initially', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => new Promise<Response>(() => {})));
    const { getByTestId } = await render(<FileViewScreen />);
    expect(getByTestId('files.loading')).toBeTruthy();
  });

  it('renders markdown preview for .md files with heading', async () => {
    configureBackend('https://backend.example');
    const content = '# Hello World\n\nThis is a paragraph.\n';
    setFetch(
      jest.fn(async () =>
        jsonRes({ path: 'docs/readme.md', content, size: content.length, encoding: 'utf8' }),
      ),
    );
    const { findByTestId, getByText } = await render(<FileViewScreen />);
    expect(await findByTestId('files.markdown')).toBeTruthy();
    expect(getByText('Hello World')).toBeTruthy();
  });

  it('renders raw content for non-md files', async () => {
    configureBackend('https://backend.example');
    setPath('src/index.ts');
    const content = 'export const x = 1;\n';
    setFetch(
      jest.fn(async () =>
        jsonRes({ path: 'src/index.ts', content, size: content.length, encoding: 'utf8' }),
      ),
    );
    const { findByTestId } = await render(<FileViewScreen />);
    expect(await findByTestId('files.raw')).toBeTruthy();
  });

  it('shows large file warning banner when size exceeds threshold', async () => {
    configureBackend('https://backend.example');
    const content = 'x'.repeat(1000);
    const bigSize = 512 * 1024 + 1;
    setFetch(
      jest.fn(async () =>
        jsonRes({ path: 'docs/big.md', content, size: bigSize, encoding: 'utf8' }),
      ),
    );
    const { findByTestId } = await render(<FileViewScreen />);
    expect(await findByTestId('files.largeWarning')).toBeTruthy();
  });

  it('parses frontmatter and renders panel with key', async () => {
    configureBackend('https://backend.example');
    const content = '---\ntitle: My Doc\ntags: a,b\n---\n# Hi\n';
    setFetch(
      jest.fn(async () =>
        jsonRes({ path: 'docs/readme.md', content, size: content.length, encoding: 'utf8' }),
      ),
    );
    const { findByTestId, findByText, getByText } = await render(<FileViewScreen />);
    expect(await findByTestId('files.frontmatter')).toBeTruthy();
    expect(await findByText('title')).toBeTruthy();
    expect(getByText('My Doc')).toBeTruthy();
    expect(getByText('Hi')).toBeTruthy();
  });

  it('renders error state when fetch rejects', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(() => Promise.reject(new Error('boom'))));
    const { findByTestId, findByText } = await render(<FileViewScreen />);
    expect(await findByTestId('files.error')).toBeTruthy();
    await findByText(/boom/);
  });
});
