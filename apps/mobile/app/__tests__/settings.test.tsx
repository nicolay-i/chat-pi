import { act } from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';

jest.mock('@/navigation', () => ({
  router: { replace: jest.fn() },
}));

import { router } from '@/navigation';
import SettingsScreen from '../settings';
import { backendActions, getTestRootStore } from '@/test/rootStoreHarness';
import { RootStoreProvider } from '@/providers/RootStoreProvider';
import { createRootStore } from '@/stores/rootStore';

const setBackend = (baseUrl: string | null) => {
  act(() => {
    backendActions.setBaseUrl(baseUrl);
  });
};

const resetBackend = () => {
  act(() => {
    backendActions.setBaseUrl(null);
    backendActions.setCapabilities(null);
    backendActions.setStatus('idle');
  });
};

describe('SettingsScreen', () => {
  afterEach(() => {
    jest.clearAllMocks();
    resetBackend();
  });

  it('shows the current baseUrl in the connection section', async () => {
    setBackend('https://pi.example.internal');

    const { getByTestId, getByText } = await render(<SettingsScreen />);

    expect(getByTestId('settings.connection')).toBeTruthy();
    expect(getByText('https://pi.example.internal')).toBeTruthy();
  });

  it('shows app and API versions in the version section', async () => {
    act(() => {
      backendActions.setCapabilities({
        apiVersion: '1.2.3',
        piAvailable: true,
        gitAvailable: true,
        supportsWorktrees: true,
        supportsSse: true,
        supportsWebSocket: false,
        supportsPackageInstall: true,
        supportsVscodeWeb: false,
        supportsIgnis: false,
      });
    });

    const { getByTestId, getByText } = await render(<SettingsScreen />);

    expect(getByTestId('settings.version')).toBeTruthy();
    expect(getByText('Pi Agents 0.0.0')).toBeTruthy();
    expect(getByText('1.2.3')).toBeTruthy();
  });

  it('opens the confirm modal when reset connection is pressed', async () => {
    const { getByTestId, queryByTestId } = await render(<SettingsScreen />);

    expect(queryByTestId('settings.resetConfirm')).toBeNull();

    await act(async () => {
      fireEvent.press(getByTestId('settings.resetConnection'));
    });

    expect(getByTestId('settings.resetConfirm')).toBeTruthy();
  });

  it('clears the injected backend url and navigates to /setup on confirm', async () => {
    setBackend('https://pi.example.internal');

    const { getByTestId } = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('settings.resetConnection'));
    });

    await act(async () => {
      fireEvent.press(getByTestId('settings.resetConfirm'));
    });

    expect(getTestRootStore().backend.baseUrl).toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/setup');
  });

  it('resets the injected provider store instead of the legacy test fallback', async () => {
    const clear = jest.fn(async () => undefined);
    const store = createRootStore({
      storage: { load: async () => null, save: async () => undefined, clear },
    });
    store.backend.setBaseUrl('https://provider.example');
    store.backend.restored = true;
    const screen = await render(
      <RootStoreProvider store={store}><SettingsScreen /></RootStoreProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings.resetConnection'));
    });
    await waitFor(() => expect(screen.getByTestId('settings.resetConfirm')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings.resetConfirm'));
    });

    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    expect(store.backend.baseUrl).toBeNull();
    expect(router.replace).toHaveBeenCalledWith('/setup');
    store.dispose();
  });
});
