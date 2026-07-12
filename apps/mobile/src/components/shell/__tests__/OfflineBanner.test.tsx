import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { RootStoreProvider } from '@/providers/RootStoreProvider';
import { createRootStore, type RootStore } from '@/stores/rootStore';
import { OfflineBanner } from '../OfflineBanner';

describe('OfflineBanner', () => {
  let store: RootStore;

  const renderBanner = () => render(
    <RootStoreProvider store={store}><OfflineBanner /></RootStoreProvider>,
  );

  beforeEach(() => {
    store = createRootStore();
  });

  afterEach(() => {
    act(() => store.dispose());
    jest.clearAllMocks();
  });

  it('renders nothing when status is open', async () => {
    act(() => { store.connection.setStatus('open'); store.connection.acceptSequence(1); });

    const { queryByTestId } = await renderBanner();

    expect(queryByTestId('offline.banner')).toBeNull();
    expect(queryByTestId('offline.retry')).toBeNull();
  });

  it('renders nothing when status is idle', async () => {
    act(() => { store.connection.reset(); });

    const { queryByTestId } = await renderBanner();

    expect(queryByTestId('offline.banner')).toBeNull();
  });

  it('shows the amber banner with last sequence while reconnecting', async () => {
    act(() => { store.connection.setStatus('reconnecting'); store.connection.acceptSequence(42); });

    const { getByTestId, getByText } = await renderBanner();

    expect(getByTestId('offline.banner')).toBeTruthy();
    expect(getByTestId('offline.lastSequence').props.children).toBe(42);
    expect(getByTestId('offline.retry')).toBeTruthy();
    expect(getByText(/Переподключение/)).toBeTruthy();
  });

  it('shows the red banner and retry button on error status', async () => {
    act(() => { store.connection.setStatus('error'); });

    const { getByTestId, getByText, queryByTestId } = await renderBanner();

    expect(getByTestId('offline.banner')).toBeTruthy();
    expect(getByTestId('offline.retry')).toBeTruthy();
    expect(getByText('Соединение потеряно')).toBeTruthy();
    expect(queryByTestId('offline.lastSequence')).toBeNull();
  });

  it('invokes onRetry when the retry button is pressed', async () => {
    act(() => { store.connection.setStatus('error'); });
    const onRetry = jest.fn();

    const { getByTestId } = await render(
      <RootStoreProvider store={store}><OfflineBanner onRetry={onRetry} /></RootStoreProvider>,
    );

    await act(async () => {
      fireEvent.press(getByTestId('offline.retry'));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when onRetry is omitted', async () => {
    act(() => { store.connection.setStatus('error'); });

    const { getByTestId } = await renderBanner();

    await act(async () => {
      fireEvent.press(getByTestId('offline.retry'));
    });
  });
});
