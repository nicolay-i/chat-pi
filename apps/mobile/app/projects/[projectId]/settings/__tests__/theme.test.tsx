import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ projectId: 'project-demo' })),
}));

jest.mock('@/state/backendStorage', () => ({
  loadBackendUrl: jest.fn().mockResolvedValue(null),
  saveBackendUrl: jest.fn().mockResolvedValue(undefined),
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import ThemeScreen from '../theme';
import { useThemeStore } from '@/features/theme/themeStore';

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

describe('ThemeScreen', () => {
  beforeEach(() => {
    useThemeStore.getState().reset();
  });

  afterEach(() => {
    restoreFetch();
    jest.clearAllMocks();
  });

  it('entering a valid accent updates the preview user bubble background', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes({ ok: true })));

    const { findByTestId } = await render(<ThemeScreen />);
    const input = await findByTestId('theme.color.primary');

    fireEvent.changeText(input, '#00AAFF');

    const bubble = await findByTestId('theme.preview.userBubble');
    expect(bubble.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#00AAFF' })]),
    );
  });

  it('entering an invalid color shows an error indicator and does not change the preview', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes({ ok: true })));

    const { findByTestId } = await render(<ThemeScreen />);
    const input = await findByTestId('theme.color.primary');

    fireEvent.changeText(input, 'not-a-color');

    expect(await findByTestId('theme.color.primary.error')).toBeTruthy();
    const bubble = await findByTestId('theme.preview.userBubble');
    expect(bubble.props.style).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'not-a-color' })]),
    );
  });

  it('applying the Warm preset loads warm accent into the preview', async () => {
    configureBackend('https://backend.example');
    setFetch(jest.fn(async () => jsonRes({ ok: true })));

    const { findByTestId } = await render(<ThemeScreen />);
    const preset = await findByTestId('theme.preset.warm');
    fireEvent.press(preset);

    const bubble = await findByTestId('theme.preview.userBubble');
    expect(bubble.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: '#E07A3C' })]),
    );
  });

  it('Save calls the theme endpoint with the current overrides', async () => {
    configureBackend('https://backend.example');
    const fetchMock = jest.fn(async () => jsonRes({ ok: true }));
    setFetch(fetchMock);

    const { findByTestId } = await render(<ThemeScreen />);
    const primaryInput = await findByTestId('theme.color.primary');
    fireEvent.changeText(primaryInput, '#112233');

    const saveBtn = await findByTestId('theme.save');
    fireEvent.press(saveBtn);

    await findByTestId('theme.saved');

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
      const last = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(String(last[0])).toBe('https://backend.example/api/projects/project-demo/theme');
      const init = (last[1] ?? {}) as RequestInit;
      const body = JSON.parse(String(init.body)) as { color?: { primary?: string } };
      expect(body.color?.primary).toBe('#112233');
    });
  });
});
