import { clearBackendUrl, loadBackendUrl, saveBackendUrl } from '../backendStorage';

describe('backendStorage on web', () => {
  const values = new Map<string, string>();
  let originalStorage: PropertyDescriptor | undefined;

  beforeEach(() => {
    values.clear();
    originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('persists the backend URL across a store reload', async () => {
    await saveBackendUrl('https://chat.tailnet.ts.net');
    expect(await loadBackendUrl()).toBe('https://chat.tailnet.ts.net');

    await clearBackendUrl();
    expect(await loadBackendUrl()).toBeNull();
  });
});
