import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createRootStore, type RootStore } from '@/stores/rootStore';

const RootStoreContext = createContext<RootStore | null>(null);

type RootStoreProviderProps = {
  children: ReactNode;
  store?: RootStore;
};

export function RootStoreProvider({ children, store }: RootStoreProviderProps) {
  const [ownedStore] = useState(() => createRootStore());
  const activeStore = store ?? ownedStore;

  useEffect(() => {
    void activeStore.backend.restore();
    return () => {
      if (!store) activeStore.dispose();
    };
  }, [activeStore, store]);

  return <RootStoreContext.Provider value={activeStore}>{children}</RootStoreContext.Provider>;
}

export function useRootStore(): RootStore {
  const store = useContext(RootStoreContext);
  if (!store) throw new Error('RootStoreProvider is missing');
  return store;
}
