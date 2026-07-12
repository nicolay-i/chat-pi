import { act } from 'react';
import { fireEvent } from '@testing-library/react-native';
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

import { router } from '@/navigation';
import PackagesScreen from '../packages';
import PackageInstallScreen from '../packages/install';

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

const MANIFEST = {
  name: 'pi-plugin-demo',
  version: '1.2.3',
  description: 'A demo plugin',
  resources: {
    extensions: ['ext.chat.sidebar'],
    skills: ['skill.write'],
    prompts: ['prompt.review'],
    themes: ['theme.dark'],
    providers: ['openai'],
  },
  trusted: false,
};

async function resolveInstall(fetchImpl: FetchImpl): Promise<ReturnType<typeof render>> {
  configureBackend('https://backend.example');
  setFetch(fetchImpl);
  const utils = await render(<PackageInstallScreen />);
  const sourceInput = await utils.findByTestId('packages.install.sourceInput');
  await act(async () => {
    fireEvent.changeText(sourceInput, 'pi-plugin-demo');
  });
  const resolveBtn = await utils.findByTestId('packages.install.resolve');
  await act(async () => {
    fireEvent.press(resolveBtn);
  });
  await utils.findByTestId('packages.install.resources');
  return utils;
}

describe('PackagesScreen (list)', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('renders installed packages with trust toggle', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([MANIFEST])));

    const { findByTestId, findByText } = await render(<PackagesScreen />);
    expect(await findByTestId('packages.list')).toBeTruthy();
    expect(await findByTestId('packages.item.pi-plugin-demo')).toBeTruthy();
    expect(await findByTestId('packages.trust.pi-plugin-demo')).toBeTruthy();
    expect(await findByText('расширения отключены')).toBeTruthy();
  });

  it('toggling trust off (untrusted) shows the disabled note', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/packages/pi-plugin-demo/trust') && init?.method === 'POST') {
          return jsonRes({ installId: 'pi-plugin-demo', status: 'installed', manifest: { ...MANIFEST, trusted: true } });
        }
        return jsonRes([{ ...MANIFEST, trusted: true }]);
      }),
    );

    const { findByTestId, queryByText } = await render(<PackagesScreen />);
    const toggle = await findByTestId('packages.trust.pi-plugin-demo');
    expect(toggle.props.value).toBe(true);

    await act(async () => {
      fireEvent(toggle, 'valueChange', false);
    });

    expect(await findByTestId('packages.trust.pi-plugin-demo')).toBeTruthy();
    expect(queryByText('расширения отключены')).toBeTruthy();
  });
});

describe('PackageInstallScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('resolve shows resources panel with extensions/skills/etc.', async () => {
    const utils = await resolveInstall(
      jest.fn(async () =>
        jsonRes({ installId: 'inst-1', status: 'pending_trust', manifest: MANIFEST }),
      ),
    );

    expect(utils.getByText('Extensions (1)')).toBeTruthy();
    expect(utils.getByText('ext.chat.sidebar')).toBeTruthy();
    expect(utils.getByText('Skills (1)')).toBeTruthy();
    expect(utils.getByText('Prompts (1)')).toBeTruthy();
    expect(utils.getByText('Themes (1)')).toBeTruthy();
    expect(utils.getByText('Providers (1)')).toBeTruthy();
  });

  it('install is disabled until trust toggle is on', async () => {
    const utils = await resolveInstall(
      jest.fn(async () =>
        jsonRes({ installId: 'inst-1', status: 'pending_trust', manifest: MANIFEST }),
      ),
    );

    const installBefore = await utils.findByTestId('packages.install.install');
    await act(async () => {
      fireEvent.press(installBefore);
    });
    expect(router.back).not.toHaveBeenCalled();

    const trust = await utils.findByTestId('packages.install.trust');
    await act(async () => {
      fireEvent(trust, 'valueChange', true);
    });

    const installAfter = await utils.findByTestId('packages.install.install');
    await act(async () => {
      fireEvent.press(installAfter);
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('install navigates back after success', async () => {
    const utils = await resolveInstall(
      jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/packages/install') && init?.method === 'POST') {
          return jsonRes({ installId: 'inst-1', status: 'installed', manifest: MANIFEST });
        }
        return jsonRes({ installId: 'inst-1', status: 'pending_trust', manifest: MANIFEST });
      }),
    );

    const trust = await utils.findByTestId('packages.install.trust');
    await act(async () => {
      fireEvent(trust, 'valueChange', true);
    });

    const install = await utils.findByTestId('packages.install.install');
    await act(async () => {
      fireEvent.press(install);
    });
    expect(router.back).toHaveBeenCalled();
  });
});
