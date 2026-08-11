import type { Capabilities } from '@pi-agents/contracts';
import { useRootStore } from '@/providers/RootStoreProvider';
import { useMobxSnapshot } from './useMobxSnapshot';
import type { ServerConnection } from './rootStore';

export type BackendStatus = 'idle' | 'checking' | 'connected' | 'offline' | 'auth_required' | 'error';

export type BackendState = {
  servers: ServerConnection[];
  activeServerId: string | null;
  baseUrl: string | null;
  capabilities: Capabilities | null;
  status: BackendStatus;
  connect: (url: string, credential?: string) => Promise<ServerConnection | null>;
  activate: (serverId: string) => boolean;
  rename: (serverId: string, name: string) => Promise<void>;
  remove: (serverId: string) => Promise<void>;
  setBaseUrl: (url: string | null) => void;
  setCapabilities: (capabilities: Capabilities | null) => void;
  setStatus: (status: BackendStatus) => void;
  reset: () => Promise<void>;
};

export function useBackend(): BackendState {
  const store = useRootStore();
  return useMobxSnapshot(() => ({
    servers: store.backend.connections,
    activeServerId: store.backend.activeServerId,
    baseUrl: store.backend.baseUrl,
    capabilities: store.backend.capabilities,
    status: store.backend.status,
    connect: store.backend.connect,
    activate: store.backend.activate,
    rename: store.backend.rename,
    remove: store.backend.remove,
    setBaseUrl: store.backend.setBaseUrl,
    setCapabilities: store.backend.setCapabilities,
    setStatus: store.backend.setStatus,
    reset: store.reset,
  }));
}
