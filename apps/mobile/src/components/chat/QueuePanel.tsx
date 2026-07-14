import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ChevronDown, ChevronUp, ListOrdered, Trash2 } from 'lucide-react-native';
import type { QueuedMessage } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';

type QueuePanelProps = {
  baseUrl: string | null;
  chatId: string;
  pendingCount: number;
};

export function QueuePanel({ baseUrl, chatId, pendingCount }: QueuePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState<QueuedMessage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const observedPendingCount = useRef(pendingCount);

  const load = useCallback(async () => {
    if (!baseUrl) return;
    setBusy(true);
    setError(null);
    try {
      setItems(await new ApiClient(baseUrl).getQueue(chatId));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setBusy(false);
    }
  }, [baseUrl, chatId]);

  useEffect(() => {
    const countChanged = observedPendingCount.current !== pendingCount;
    observedPendingCount.current = pendingCount;
    if (!expanded || !baseUrl || items === null || !countChanged) return;
    let active = true;
    void new ApiClient(baseUrl).getQueue(chatId)
      .then((next) => { if (active) setItems(next); })
      .catch((refreshError: unknown) => {
        if (active) setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      });
    return () => { active = false; };
  }, [baseUrl, chatId, expanded, items, pendingCount]);

  const toggle = (): void => {
    if (expanded) {
      setExpanded(false);
      setConfirmingClear(false);
      return;
    }
    setExpanded(true);
    void load();
  };

  const move = (index: number, offset: -1 | 1): void => {
    if (!baseUrl || !items || busy) return;
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    setError(null);
    void new ApiClient(baseUrl).reorderQueue(chatId, next.map((item) => item.id))
      .then(setItems)
      .catch((moveError: unknown) => setError(moveError instanceof Error ? moveError.message : String(moveError)))
      .finally(() => setBusy(false));
  };

  const remove = (itemId: string): void => {
    if (!baseUrl || !items || busy) return;
    setBusy(true);
    setError(null);
    void new ApiClient(baseUrl).removeQueueItem(chatId, itemId)
      .then(() => setItems((current) => current?.filter((item) => item.id !== itemId) ?? []))
      .catch((removeError: unknown) => setError(removeError instanceof Error ? removeError.message : String(removeError)))
      .finally(() => setBusy(false));
  };

  const clear = (): void => {
    if (!baseUrl || busy) return;
    setBusy(true);
    setError(null);
    void new ApiClient(baseUrl).clearQueue(chatId)
      .then(() => {
        setItems([]);
        setConfirmingClear(false);
      })
      .catch((clearError: unknown) => setError(clearError instanceof Error ? clearError.message : String(clearError)))
      .finally(() => setBusy(false));
  };

  const visibleCount = items?.length ?? pendingCount;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: tokens.color.border, backgroundColor: tokens.color.surface }}>
      <Pressable
        testID="chat.queue.toggle"
        accessibilityRole="button"
        accessibilityLabel={`Очередь сообщений, ${visibleCount}`}
        accessibilityState={{ expanded }}
        disabled={!baseUrl}
        onPress={toggle}
        style={{ minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}
      >
        <ListOrdered size={17} color={tokens.color.textMuted} />
        <Text style={{ flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm, fontWeight: '600' }}>
          Очередь ({visibleCount})
        </Text>
        {expanded ? <ChevronUp size={17} color={tokens.color.textMuted} /> : <ChevronDown size={17} color={tokens.color.textMuted} />}
      </Pressable>

      {expanded ? (
        <View testID="chat.queue.panel" style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
          {busy && items === null ? <Text testID="chat.queue.loading" style={{ color: tokens.color.textMuted }}>Загрузка…</Text> : null}
          {error ? (
            <View testID="chat.queue.error" style={{ gap: 6 }}>
              <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.sm }}>{error}</Text>
              <Pressable accessibilityRole="button" onPress={() => { void load(); }} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Text style={{ color: tokens.color.primary, fontWeight: '600' }}>Повторить</Text>
              </Pressable>
            </View>
          ) : null}
          {items?.length === 0 ? <Text testID="chat.queue.empty" style={{ color: tokens.color.textMuted, paddingVertical: 8 }}>Очередь пуста.</Text> : null}
          {items && items.length > 0 ? (
            <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }} nestedScrollEnabled>
              {items.map((item, index) => (
                <View
                  key={item.id}
                  testID={`chat.queue.item.${item.id}`}
                  style={{ borderWidth: 1, borderColor: tokens.color.border, borderRadius: tokens.radius.md, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Text style={{ flex: 1, color: tokens.color.text, fontSize: tokens.fontSize.sm }} numberOfLines={3}>{item.text}</Text>
                  <Pressable
                    testID={`chat.queue.up.${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Поднять сообщение"
                    disabled={busy || index === 0}
                    onPress={() => move(index, -1)}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: busy || index === 0 ? 0.35 : 1 }}
                  >
                    <ChevronUp size={18} color={tokens.color.text} />
                  </Pressable>
                  <Pressable
                    testID={`chat.queue.down.${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Опустить сообщение"
                    disabled={busy || index === items.length - 1}
                    onPress={() => move(index, 1)}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: busy || index === items.length - 1 ? 0.35 : 1 }}
                  >
                    <ChevronDown size={18} color={tokens.color.text} />
                  </Pressable>
                  <Pressable
                    testID={`chat.queue.remove.${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Удалить сообщение из очереди"
                    disabled={busy}
                    onPress={() => remove(item.id)}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.35 : 1 }}
                  >
                    <Trash2 size={18} color={tokens.color.danger} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {items && items.length > 0 ? (
            confirmingClear ? (
              <View testID="chat.queue.clearConfirmation" style={{ flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Text style={{ flex: 1, minWidth: 180, color: tokens.color.text, fontSize: tokens.fontSize.sm }}>Удалить все ожидающие сообщения?</Text>
                <Pressable accessibilityRole="button" testID="chat.queue.clearCancel" onPress={() => setConfirmingClear(false)} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' }}>
                  <Text style={{ color: tokens.color.text }}>Отмена</Text>
                </Pressable>
                <Pressable accessibilityRole="button" testID="chat.queue.clearConfirm" disabled={busy} onPress={clear} style={{ minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: tokens.radius.sm, backgroundColor: tokens.color.danger }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '600' }}>Очистить</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable accessibilityRole="button" testID="chat.queue.clear" disabled={busy} onPress={() => setConfirmingClear(true)} style={{ minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' }}>
                <Text style={{ color: tokens.color.danger, fontWeight: '600' }}>Очистить очередь</Text>
              </Pressable>
            )
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
