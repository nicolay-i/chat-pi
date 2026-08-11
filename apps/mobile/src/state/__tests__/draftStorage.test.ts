import { clearChatDraft, loadChatDraft, saveChatDraft } from '../draftStorage';

describe('chat draft storage', () => {
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

  it('keeps drafts isolated by server and chat across a reload', async () => {
    await saveChatDraft('chat-1', 'node-a', 'draft on A');
    await saveChatDraft('chat-1', 'node-b', 'draft on B');

    expect(await loadChatDraft('chat-1', 'node-a')).toBe('draft on A');
    expect(await loadChatDraft('chat-1', 'node-b')).toBe('draft on B');
    expect(await loadChatDraft('chat-1', 'node-c')).toBeNull();
  });

  it('clears only the selected server/chat draft', async () => {
    await saveChatDraft('chat-1', 'node-a', 'draft on A');
    await saveChatDraft('chat-1', 'node-b', 'draft on B');

    await clearChatDraft('chat-1', 'node-a');

    expect(await loadChatDraft('chat-1', 'node-a')).toBeNull();
    expect(await loadChatDraft('chat-1', 'node-b')).toBe('draft on B');
  });
});
