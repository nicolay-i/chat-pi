import { create } from 'zustand';
import type { Capabilities } from '@pi-agents/contracts';
import { loadBackendUrl, saveBackendUrl } from './backendStorage';

export type BackendStatus = 'idle' | 'checking' | 'connected' | 'error';

export type BackendState = {
  baseUrl: string | null;
  capabilities: Capabilities | null;
  status: BackendStatus;
  setBaseUrl: (url: string | null) => void;
  setCapabilities: (capabilities: Capabilities | null) => void;
  setStatus: (status: BackendStatus) => void;
};

const useBackendStore = create<BackendState>((set) => ({
  baseUrl: null,
  capabilities: null,
  status: 'idle',
  setBaseUrl: (baseUrl) => set({ baseUrl }),
  setCapabilities: (capabilities) => set({ capabilities }),
  setStatus: (status) => set({ status }),
}));

export function useBackend(): BackendState {
  return useBackendStore();
}

export async function loadPersistedBackend(): Promise<string | null> {
  const url = await loadBackendUrl();
  if (url) {
    useBackendStore.getState().setBaseUrl(url);
    useBackendStore.getState().setStatus('idle');
  }
  return url;
}

export async function persistBaseUrl(url: string): Promise<void> {
  await saveBackendUrl(url);
  useBackendStore.getState().setBaseUrl(url);
}

export const backendActions = {
  setBaseUrl: useBackendStore.getState().setBaseUrl,
  setCapabilities: useBackendStore.getState().setCapabilities,
  setStatus: useBackendStore.getState().setStatus,
};
