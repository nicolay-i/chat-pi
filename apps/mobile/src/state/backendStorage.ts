import * as SecureStore from 'expo-secure-store';
import { ProjectSchema, type Project } from '@pi-agents/contracts';

const KEY = 'backend.url';
const CONNECTIONS_KEY = 'backend.connections.v1';
const CREDENTIAL_PREFIX = 'backend.credential.v1.';
const PROJECTS_SNAPSHOT_PREFIX = 'backend.projects.snapshot.v1.';

const memoryStore = new Map<string, string>();
let useMemory = false;

function webStorage(): Storage | undefined {
  if (typeof globalThis.localStorage === 'undefined') return undefined;
  return globalThis.localStorage;
}

export async function loadBackendUrl(): Promise<string | null> {
  const storage = webStorage();
  if (storage) {
    try {
      return storage.getItem(KEY);
    } catch {
      useMemory = true;
      return memoryStore.get(KEY) ?? null;
    }
  }
  if (useMemory) {
    return memoryStore.get(KEY) ?? null;
  }
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    useMemory = true;
    return memoryStore.get(KEY) ?? null;
  }
}

export async function saveBackendUrl(url: string): Promise<void> {
  const storage = webStorage();
  if (storage) {
    try {
      storage.setItem(KEY, url);
      return;
    } catch {
      useMemory = true;
      memoryStore.set(KEY, url);
      return;
    }
  }
  if (useMemory) {
    memoryStore.set(KEY, url);
    return;
  }
  try {
    await SecureStore.setItemAsync(KEY, url);
  } catch {
    useMemory = true;
    memoryStore.set(KEY, url);
  }
}

export async function clearBackendUrl(): Promise<void> {
  const storage = webStorage();
  if (storage) {
    try {
      storage.removeItem(KEY);
      return;
    } catch {
      useMemory = true;
      memoryStore.delete(KEY);
      return;
    }
  }
  if (useMemory) {
    memoryStore.delete(KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    useMemory = true;
    memoryStore.delete(KEY);
  }
}

export type StoredBackendConnection = {
  serverId: string;
  name: string;
  baseUrl: string;
};

function credentialKey(serverId: string): string {
  return `${CREDENTIAL_PREFIX}${encodeURIComponent(serverId)}`;
}

function projectsSnapshotKey(serverId: string): string {
  return `${PROJECTS_SNAPSHOT_PREFIX}${encodeURIComponent(serverId)}`;
}

function parseProjectsSnapshot(value: string | null): Project[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const result = ProjectSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    return [];
  }
}

/**
 * Project metadata is safe to cache and lets the Web/PWA explain an offline
 * node after a reload. It deliberately never stores credentials or event
 * payloads. Native SecureStore is used as the durable fallback; if its value
 * size limit is reached, the in-memory fallback keeps the current session
 * usable without failing the network refresh.
 */
export async function loadBackendProjectsSnapshot(serverId: string): Promise<Project[]> {
  const key = projectsSnapshotKey(serverId);
  const storage = webStorage();
  if (storage) {
    try {
      return parseProjectsSnapshot(storage.getItem(key));
    } catch {
      useMemory = true;
      return parseProjectsSnapshot(memoryStore.get(key) ?? null);
    }
  }
  if (useMemory) return parseProjectsSnapshot(memoryStore.get(key) ?? null);
  try {
    return parseProjectsSnapshot(await SecureStore.getItemAsync(key));
  } catch {
    useMemory = true;
    return parseProjectsSnapshot(memoryStore.get(key) ?? null);
  }
}

export async function saveBackendProjectsSnapshot(serverId: string, projects: Project[]): Promise<void> {
  const key = projectsSnapshotKey(serverId);
  const serialized = JSON.stringify(projects);
  const storage = webStorage();
  if (storage) {
    try {
      storage.setItem(key, serialized);
      return;
    } catch {
      useMemory = true;
      memoryStore.set(key, serialized);
      return;
    }
  }
  if (useMemory) {
    memoryStore.set(key, serialized);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, serialized);
  } catch {
    useMemory = true;
    memoryStore.set(key, serialized);
  }
}

export async function clearBackendProjectsSnapshot(serverId: string): Promise<void> {
  const key = projectsSnapshotKey(serverId);
  memoryStore.delete(key);
  const storage = webStorage();
  if (storage) {
    try {
      storage.removeItem(key);
    } catch {
      useMemory = true;
    }
    return;
  }
  if (useMemory) return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    useMemory = true;
  }
}

/**
 * Credentials deliberately do not use Web localStorage. Native builds use
 * SecureStore; Web keeps the token in memory for this tab/PWA process until a
 * real browser credential provider is introduced. Losing the token on reload
 * is preferable to silently copying a bearer secret into a readable origin
 * store.
 */
export async function loadBackendCredential(serverId: string): Promise<string | null> {
  const key = credentialKey(serverId);
  if (webStorage()) return memoryStore.get(key) ?? null;
  if (useMemory) return memoryStore.get(key) ?? null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    useMemory = true;
    return memoryStore.get(key) ?? null;
  }
}

export async function saveBackendCredential(serverId: string, token: string): Promise<void> {
  const key = credentialKey(serverId);
  const normalized = token.trim();
  if (!normalized) {
    await clearBackendCredential(serverId);
    return;
  }
  if (webStorage() || useMemory) {
    memoryStore.set(key, normalized);
    return;
  }
  try {
    await SecureStore.setItemAsync(key, normalized);
  } catch {
    useMemory = true;
    memoryStore.set(key, normalized);
  }
}

export async function clearBackendCredential(serverId: string): Promise<void> {
  const key = credentialKey(serverId);
  memoryStore.delete(key);
  if (webStorage() || useMemory) return;
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    useMemory = true;
  }
}

function parseConnections(value: string | null): StoredBackendConnection[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredBackendConnection => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.serverId === 'string'
        && typeof candidate.name === 'string'
        && typeof candidate.baseUrl === 'string';
    });
  } catch {
    return [];
  }
}

export async function loadBackendConnections(): Promise<StoredBackendConnection[]> {
  const storage = webStorage();
  if (storage) {
    try {
      return parseConnections(storage.getItem(CONNECTIONS_KEY));
    } catch {
      useMemory = true;
      return parseConnections(memoryStore.get(CONNECTIONS_KEY) ?? null);
    }
  }
  if (useMemory) return parseConnections(memoryStore.get(CONNECTIONS_KEY) ?? null);
  try {
    return parseConnections(await SecureStore.getItemAsync(CONNECTIONS_KEY));
  } catch {
    useMemory = true;
    return parseConnections(memoryStore.get(CONNECTIONS_KEY) ?? null);
  }
}

export async function saveBackendConnections(connections: StoredBackendConnection[]): Promise<void> {
  const serialized = JSON.stringify(connections);
  const storage = webStorage();
  if (storage) {
    try {
      storage.setItem(CONNECTIONS_KEY, serialized);
      return;
    } catch {
      useMemory = true;
      memoryStore.set(CONNECTIONS_KEY, serialized);
      return;
    }
  }
  if (useMemory) {
    memoryStore.set(CONNECTIONS_KEY, serialized);
    return;
  }
  try {
    await SecureStore.setItemAsync(CONNECTIONS_KEY, serialized);
  } catch {
    useMemory = true;
    memoryStore.set(CONNECTIONS_KEY, serialized);
  }
}

export async function clearBackendConnections(): Promise<void> {
  const storage = webStorage();
  if (storage) {
    try {
      storage.removeItem(CONNECTIONS_KEY);
      return;
    } catch {
      useMemory = true;
      memoryStore.delete(CONNECTIONS_KEY);
      return;
    }
  }
  if (useMemory) {
    memoryStore.delete(CONNECTIONS_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(CONNECTIONS_KEY);
  } catch {
    useMemory = true;
    memoryStore.delete(CONNECTIONS_KEY);
  }
}
