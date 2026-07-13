import { act, render, waitFor } from '@testing-library/react-native';
import { RootStoreProvider } from '@/providers/RootStoreProvider';
import { createRootStore, type RootStore } from '@/stores/rootStore';

jest.mock('@/navigation', () => ({
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/features/ignis/IgnisFrame', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return {
    IgnisFrame: ({ url }: { url: string }) => React.createElement(Text, { testID: 'ignis.frame' }, url),
  };
});

import IgnisScreen from '../obsidian';

function response(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

describe('IgnisScreen', () => {
  const originalFetch = globalThis.fetch;
  let store: RootStore | null = null;

  afterEach(() => {
    store?.dispose();
    store = null;
    globalThis.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('recovers from the initial missing URL while the persisted backend is restoring', async () => {
    let resolveRestore: (url: string | null) => void = () => undefined;
    const restoreComplete = new Promise<string | null>((resolve) => {
      resolveRestore = resolve;
    });
    globalThis.fetch = jest.fn(async () => response({
      url: 'https://ignis.tailnet.example',
      activeTaskCount: 0,
    })) as typeof fetch;
    store = createRootStore({
      storage: {
        load: async () => restoreComplete,
        save: async () => undefined,
        clear: async () => undefined,
      },
    });

    const screen = await render(
      <RootStoreProvider store={store}>
        <IgnisScreen />
      </RootStoreProvider>,
    );
    expect(screen.getByText('Backend URL is not configured')).toBeTruthy();

    await act(async () => {
      resolveRestore('https://backend.example');
      await restoreComplete;
    });

    await waitFor(() => expect(screen.getByTestId('ignis.frame').props.children).toBe('https://ignis.tailnet.example'));
    expect(globalThis.fetch).toHaveBeenCalledWith('https://backend.example/api/projects/project-demo/ignis');
  });
});
