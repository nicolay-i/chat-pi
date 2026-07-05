import * as SecureStore from 'expo-secure-store';

const KEY = 'backend.url';

const memoryStore = new Map<string, string>();
let useMemory = false;

export async function loadBackendUrl(): Promise<string | null> {
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
