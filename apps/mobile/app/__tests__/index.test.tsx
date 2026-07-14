import { act, waitFor } from '@testing-library/react-native';
import { renderWithStore as render } from '@/test/renderWithStore';
import { router } from '@/navigation';
import { createRootStore, type RootStore } from '@/stores/rootStore';
import HomeScreen from '../index';

jest.mock('@/navigation', () => ({
  router: { replace: jest.fn() },
}));

describe('HomeScreen', () => {
  let store: RootStore;

  afterEach(() => {
    store.dispose();
    jest.clearAllMocks();
  });

  it('waits for backend storage restoration before navigating', async () => {
    store = createRootStore({
      storage: {
        load: () => new Promise<string | null>(() => undefined),
        save: async () => undefined,
        clear: async () => undefined,
      },
    });

    const { getByTestId } = await render(<HomeScreen />, { store });

    expect(getByTestId('home.loading')).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens projects when a backend URL was restored', async () => {
    store = createRootStore({
      storage: {
        load: async () => 'https://backend.example',
        save: async () => undefined,
        clear: async () => undefined,
      },
    });

    await render(<HomeScreen />, { store });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/projects'));
  });

  it('opens setup when no backend URL was restored', async () => {
    store = createRootStore({
      storage: {
        load: async () => null,
        save: async () => undefined,
        clear: async () => undefined,
      },
    });

    await act(async () => {
      await render(<HomeScreen />, { store });
    });

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/setup'));
  });
});
