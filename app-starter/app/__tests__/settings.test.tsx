import { act } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/state/backendStorage', () => ({
  clearBackendUrl: jest.fn().mockResolvedValue(undefined),
}));

import { router } from 'expo-router';
import SettingsScreen from '../settings';
import { backendActions } from '@/state/backendStore';
import { clearBackendUrl } from '@/state/backendStorage';

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

  it('clears the backend url and navigates to /setup on confirm', async () => {
    setBackend('https://pi.example.internal');

    const { getByTestId } = await render(<SettingsScreen />);

    await act(async () => {
      fireEvent.press(getByTestId('settings.resetConnection'));
    });

    await act(async () => {
      fireEvent.press(getByTestId('settings.resetConfirm'));
    });

    await waitFor(() => expect(clearBackendUrl).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith('/setup');
  });
});
