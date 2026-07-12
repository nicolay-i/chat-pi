import type { Capabilities } from '@pi-agents/contracts';
import { useRootStore } from '@/providers/RootStoreProvider';
import { useMobxSnapshot } from './useMobxSnapshot';

export type BackendStatus = 'idle' | 'checking' | 'connected' | 'error';

export type BackendState = {
  baseUrl: string | null;
  capabilities: Capabilities | null;
  status: BackendStatus;
  setBaseUrl: (url: string | null) => void;
  setCapabilities: (capabilities: Capabilities | null) => void;
  setStatus: (status: BackendStatus) => void;
  reset: () => Promise<void>;
};

export function useBackend(): BackendState {
  const store = useRootStore();
  return useMobxSnapshot(() => ({
    baseUrl: store.backend.baseUrl,
    capabilities: store.backend.capabilities,
    status: store.backend.status,
    setBaseUrl: store.backend.setBaseUrl,
    setCapabilities: store.backend.setCapabilities,
    setStatus: store.backend.setStatus,
    reset: store.reset,
  }));
}
