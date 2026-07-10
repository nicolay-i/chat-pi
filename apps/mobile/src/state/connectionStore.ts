import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'error';

type ConnectionState = {
  status: ConnectionStatus;
  lastEventId: string | null;
  setStatus: (status: ConnectionStatus) => void;
  setLastEventId: (id: string | null) => void;
};

const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'idle',
  lastEventId: null,
  setStatus: (status) => set({ status }),
  setLastEventId: (id) => set({ lastEventId: id }),
}));

export function useConnection(): ConnectionState {
  return useConnectionStore();
}

// Selector helper: offline whenever we're actively trying to recover or have given up.
export function selectIsOffline(status: ConnectionStatus): boolean {
  return status === 'error' || status === 'reconnecting';
}

export const connectionActions = {
  setStatus: useConnectionStore.getState().setStatus,
  setLastEventId: useConnectionStore.getState().setLastEventId,
};

export default useConnectionStore;
