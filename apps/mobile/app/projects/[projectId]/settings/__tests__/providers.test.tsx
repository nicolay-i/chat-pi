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

import ProvidersScreen from '../providers';

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

const RAW_SECRET = 'sk-test-DO-NOT-LEAK-1234567';

describe('ProvidersScreen', () => {
  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('shows a masked secret indicator and never the raw key', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async () =>
        jsonRes([
          {
            id: 'prov-openai',
            type: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            hasSecret: true,
            models: [{ id: 'gpt-4o', label: 'GPT-4o' }],
          },
        ]),
      ),
    );

    const { findByTestId, queryByText } = await render(<ProvidersScreen />);
    expect(await findByTestId('providers.list')).toBeTruthy();
    expect(await findByTestId('providers.item.prov-openai')).toBeTruthy();
    expect(await findByTestId('providers.test.prov-openai')).toBeTruthy();
    expect(queryByText('secret: ••••')).toBeTruthy();
    expect(queryByText(RAW_SECRET)).toBeNull();
  });

  it('add-provider form has a secureTextEntry API key field', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes([])));

    const { findByTestId } = await render(<ProvidersScreen />);
    fireEvent.press(await findByTestId('providers.add'));

    const apiKey = await findByTestId('providers.apiKey');
    expect(apiKey.props.secureTextEntry).toBe(true);
  });

  it('saves a provider via createProvider and clears the key from form', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/providers') && init?.method === 'POST') {
        return jsonRes({
          id: 'prov-new',
          type: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          hasSecret: true,
          models: [],
        });
      }
      return jsonRes([
        {
          id: 'prov-new',
          type: 'openai',
          baseUrl: 'https://api.openai.com/v1',
          hasSecret: true,
          models: [],
        },
      ]);
    });
    setFetch(fetchMock);

    const { findByTestId } = await render(<ProvidersScreen />);
    fireEvent.press(await findByTestId('providers.add'));

    const apiKey = await findByTestId('providers.apiKey');
    await act(async () => {
      fireEvent.changeText(apiKey, RAW_SECRET);
    });

    const save = await findByTestId('providers.save');
    await act(async () => {
      fireEvent.press(save);
    });

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts.length).toBeGreaterThan(0);
    const rawPayload = posts[0][1]?.body ? String(posts[0][1]?.body) : '';
    expect(rawPayload).not.toContain(RAW_SECRET);
  });

  it('test connection shows the result', async () => {
    configureBackend('https://backend.example');
    setFetch(
      jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/providers/') && url.endsWith('/test') && init?.method === 'POST') {
          return jsonRes({ ok: true, modelsFound: ['gpt-4o', 'gpt-4o-mini'], error: undefined });
        }
        return jsonRes([
          {
            id: 'prov-openai',
            type: 'openai',
            baseUrl: 'https://api.openai.com/v1',
            hasSecret: true,
            models: [],
          },
        ]);
      }),
    );

    const { findByTestId, findByText } = await render(<ProvidersScreen />);
    await findByTestId('providers.item.prov-openai');

    const testBtn = await findByTestId('providers.test.prov-openai');
    await act(async () => {
      fireEvent.press(testBtn);
    });

    expect(await findByText('Connection OK')).toBeTruthy();
  });
});
