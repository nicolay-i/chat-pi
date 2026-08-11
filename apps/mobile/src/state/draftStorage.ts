const memoryDrafts = new Map<string, string>();

function draftKey(chatId: string, serverId?: string | null): string {
  const scope = serverId ?? 'legacy';
  return `chat.draft.v1:${scope}:${chatId}`;
}

function storage(): Storage | undefined {
  if (typeof globalThis.localStorage === 'undefined') return undefined;
  return globalThis.localStorage;
}

export async function loadChatDraft(chatId: string, serverId?: string | null): Promise<string | null> {
  const key = draftKey(chatId, serverId);
  const target = storage();
  if (target) {
    try {
      return target.getItem(key);
    } catch {
      return memoryDrafts.get(key) ?? null;
    }
  }
  return memoryDrafts.get(key) ?? null;
}

export async function saveChatDraft(chatId: string, serverId: string | null | undefined, value: string): Promise<void> {
  const key = draftKey(chatId, serverId);
  const target = storage();
  if (target) {
    try {
      if (value) target.setItem(key, value);
      else target.removeItem(key);
      return;
    } catch {
      if (value) memoryDrafts.set(key, value);
      else memoryDrafts.delete(key);
      return;
    }
  }
  if (value) memoryDrafts.set(key, value);
  else memoryDrafts.delete(key);
}

export async function clearChatDraft(chatId: string, serverId?: string | null): Promise<void> {
  await saveChatDraft(chatId, serverId, '');
}
