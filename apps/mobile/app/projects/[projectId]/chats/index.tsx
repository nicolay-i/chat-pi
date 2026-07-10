import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Chat, RunMode } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { useChats } from '@/features/chats/useChats';

type ModeFilter = 'all' | RunMode;

const FILTERS: ReadonlyArray<{ key: ModeFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'discussion', label: 'Discussion' },
  { key: 'planning', label: 'Planning' },
  { key: 'implementation', label: 'Implementation' },
  { key: 'orchestration', label: 'Orchestration' },
];

const MODE_BADGE: Record<RunMode, { bg: string; text: string }> = {
  discussion: { bg: '#E8F1FF', text: '#2563EB' },
  planning: { bg: '#F3E8FF', text: '#7C3AED' },
  implementation: { bg: tokens.color.successBg, text: tokens.color.successText },
  orchestration: { bg: '#FFF3E0', text: '#EA580C' },
};

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function filterChats(chats: Chat[], filter: ModeFilter, query: string): Chat[] {
  const q = query.trim().toLowerCase();
  return chats.filter((c) => {
    if (filter !== 'all' && c.mode !== filter) return false;
    if (q && !c.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

export default function ChatsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { status, data, error, refetch } = useChats(projectId);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ModeFilter>('all');

  const visible = useMemo(() => (data ? filterChats(data, filter, query) : []), [data, filter, query]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: tokens.color.text }}>Chats</Text>
          <Pressable
            testID="chats.new"
            accessibilityLabel="Start new chat"
            onPress={() => router.push(`/projects/${projectId}/chats/new`)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: tokens.radius.pill,
              backgroundColor: tokens.color.primary,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>New chat</Text>
          </Pressable>
        </View>

        <TextInput
          testID="chats.search"
          accessibilityLabel="Search chats"
          value={query}
          onChangeText={setQuery}
          placeholder="Search by title"
          placeholderTextColor={tokens.color.textMuted}
          style={{
            marginTop: 12,
            borderWidth: 1,
            borderColor: tokens.color.border,
            borderRadius: tokens.radius.md,
            paddingVertical: 8,
            paddingHorizontal: 12,
            backgroundColor: tokens.color.surface,
            color: tokens.color.text,
          }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                testID={`chats.filter.${f.key}`}
                accessibilityLabel={`Filter ${f.label}`}
                onPress={() => setFilter(f.key)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  marginRight: 8,
                  borderRadius: tokens.radius.pill,
                  borderWidth: 1,
                  borderColor: active ? tokens.color.primary : tokens.color.border,
                  backgroundColor: active ? tokens.color.primary : tokens.color.surface,
                }}
              >
                <Text style={{ color: active ? '#FFFFFF' : tokens.color.textMuted, fontWeight: '700' }}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flex: 1, marginTop: 12 }}>
        {status === 'loading' ? (
          <View testID="chats.loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <ActivityIndicator color={tokens.color.primary} />
            <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading chats…</Text>
          </View>
        ) : null}

        {status === 'error' ? (
          <View testID="chats.error" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load chats</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
            <Pressable
              testID="chats.retry"
              accessibilityLabel="Retry loading chats"
              onPress={refetch}
              style={{
                marginTop: 12,
                paddingVertical: 10,
                paddingHorizontal: 18,
                borderRadius: tokens.radius.md,
                backgroundColor: tokens.color.primary,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'empty' ? (
          <View testID="chats.empty" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>No chats yet</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>
              Start a new chat to begin working.
            </Text>
            <Pressable
              testID="chats.empty.cta"
              accessibilityLabel="Start new chat"
              onPress={() => router.push(`/projects/${projectId}/chats/new`)}
              style={{
                marginTop: 16,
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: tokens.radius.md,
                backgroundColor: tokens.color.primary,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>New chat</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'loaded' ? (
          <FlatList
            testID="chats.list"
            data={visible}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: tokens.color.textMuted }}>No chats match the current filters.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const badge = MODE_BADGE[item.mode];
              return (
                <Pressable
                  testID={`chats.item.${item.id}`}
                  accessibilityLabel={`Open chat ${item.title}`}
                  onPress={() => router.push(`/projects/${projectId}/chats/${item.id}`)}
                  style={{
                    backgroundColor: tokens.color.surface,
                    borderRadius: tokens.radius.lg,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text, flex: 1 }}>
                      {item.title}
                    </Text>
                    <View testID={`chats.item.${item.id}.mode`} style={{ backgroundColor: badge.bg, borderRadius: tokens.radius.pill, paddingVertical: 4, paddingHorizontal: 10, marginLeft: 8 }}>
                      <Text style={{ color: badge.text, fontWeight: '700', fontSize: tokens.fontSize.xs, textTransform: 'capitalize' }}>
                        {item.mode}
                      </Text>
                    </View>
                  </View>
                  {item.lastMessagePreview ? (
                    <Text style={{ marginTop: 4, color: tokens.color.textMuted }} numberOfLines={1}>
                      {item.lastMessagePreview}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    {item.activeTaskId ? (
                      <View testID={`chats.item.${item.id}.task`} style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ color: tokens.color.successText, fontSize: tokens.fontSize.sm }}>●</Text>
                        <Text style={{ color: tokens.color.successText, fontWeight: '700', fontSize: tokens.fontSize.sm, marginLeft: 4 }}>
                          active
                        </Text>
                      </View>
                    ) : (
                      <View />
                    )}
                    <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                      {formatUpdated(item.updatedAt)}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        ) : null}
      </View>
    </View>
  );
}
