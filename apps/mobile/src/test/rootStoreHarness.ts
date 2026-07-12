import type { Capabilities } from '@pi-agents/contracts';
import { createRootStore, type RootStore } from '@/stores/rootStore';

export type BackendStatus = 'idle' | 'checking' | 'connected' | 'error';

let testRootStore: RootStore | null = null;

export function getTestRootStore(): RootStore {
  if (testRootStore) return testRootStore;
  testRootStore = createRootStore({
    storage: {
      load: async () => null,
      save: async () => undefined,
      clear: async () => undefined,
    },
  });
  // Screen tests configure state directly, so storage must not overwrite it on mount.
  testRootStore.backend.restored = true;
  return testRootStore;
}

export function resetTestRootStore(): void {
  testRootStore?.dispose();
  testRootStore = null;
}

export const backendActions = {
  setBaseUrl: (baseUrl: string | null) => getTestRootStore().backend.setBaseUrl(baseUrl),
  setCapabilities: (capabilities: Capabilities | null) => getTestRootStore().backend.setCapabilities(capabilities),
  setStatus: (status: BackendStatus) => getTestRootStore().backend.setStatus(status),
};
