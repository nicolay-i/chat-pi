import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { RootStoreProvider, useRootStore } from '../RootStoreProvider';
import { createRootStore } from '@/stores/rootStore';

function Probe() {
  const { backend } = useRootStore();
  return <Text testID="provider.status">{backend.status}</Text>;
}

describe('RootStoreProvider', () => {
  it('creates an independent store for each provider mount', async () => {
    const first = await render(<RootStoreProvider><Probe /></RootStoreProvider>);
    const second = await render(<RootStoreProvider><Probe /></RootStoreProvider>);

    expect(first.getByTestId('provider.status').props.children).toBe('idle');
    expect(second.getByTestId('provider.status').props.children).toBe('idle');
  });

  it('does not dispose an injected test store on unmount', async () => {
    const store = createRootStore();
    const dispose = jest.spyOn(store, 'dispose');
    const screen = await render(<RootStoreProvider store={store}><Probe /></RootStoreProvider>);

    await act(async () => screen.unmount());

    expect(dispose).not.toHaveBeenCalled();
    store.dispose();
  });
});
