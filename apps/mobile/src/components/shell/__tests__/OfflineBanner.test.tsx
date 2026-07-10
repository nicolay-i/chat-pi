import { act } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { connectionActions } from '@/state/connectionStore';
import { OfflineBanner } from '../OfflineBanner';

const setConnection = (status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error', lastEventId: string | null) => {
  act(() => {
    connectionActions.setStatus(status);
    connectionActions.setLastEventId(lastEventId);
  });
};

const resetConnection = () => {
  act(() => {
    connectionActions.setStatus('idle');
    connectionActions.setLastEventId(null);
  });
};

describe('OfflineBanner', () => {
  afterEach(() => {
    resetConnection();
    jest.clearAllMocks();
  });

  it('renders nothing when status is open', async () => {
    setConnection('open', 'evt-1');

    const { queryByTestId } = await render(<OfflineBanner />);

    expect(queryByTestId('offline.banner')).toBeNull();
    expect(queryByTestId('offline.retry')).toBeNull();
  });

  it('renders nothing when status is idle', async () => {
    setConnection('idle', null);

    const { queryByTestId } = await render(<OfflineBanner />);

    expect(queryByTestId('offline.banner')).toBeNull();
  });

  it('shows the amber banner with lastEventId while reconnecting', async () => {
    setConnection('reconnecting', 'evt-42');

    const { getByTestId, getByText } = await render(<OfflineBanner />);

    expect(getByTestId('offline.banner')).toBeTruthy();
    expect(getByTestId('offline.lastEventId').props.children).toBe('evt-42');
    expect(getByTestId('offline.retry')).toBeTruthy();
    expect(getByText(/Переподключение/)).toBeTruthy();
  });

  it('shows the red banner and retry button on error status', async () => {
    setConnection('error', null);

    const { getByTestId, getByText, queryByTestId } = await render(<OfflineBanner />);

    expect(getByTestId('offline.banner')).toBeTruthy();
    expect(getByTestId('offline.retry')).toBeTruthy();
    expect(getByText('Соединение потеряно')).toBeTruthy();
    expect(queryByTestId('offline.lastEventId')).toBeNull();
  });

  it('invokes onRetry when the retry button is pressed', async () => {
    setConnection('error', null);
    const onRetry = jest.fn();

    const { getByTestId } = await render(<OfflineBanner onRetry={onRetry} />);

    await act(async () => {
      fireEvent.press(getByTestId('offline.retry'));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when onRetry is omitted', async () => {
    setConnection('error', null);

    const { getByTestId } = await render(<OfflineBanner />);

    await act(async () => {
      fireEvent.press(getByTestId('offline.retry'));
    });
  });
});
