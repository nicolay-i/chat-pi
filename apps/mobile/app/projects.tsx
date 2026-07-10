import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { Project } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { useProjects } from '@/features/projects/useProjects';

type Filter = 'all' | 'active' | 'needs_review' | 'stale';

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'needs_review', label: 'Needs review' },
  { key: 'stale', label: 'Stale' },
];

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function filterProjects(projects: Project[], filter: Filter, query: string): Project[] {
  const q = query.trim().toLowerCase();
  return projects.filter((p) => {
    if (q && !p.name.toLowerCase().includes(q) && !p.repoPath.toLowerCase().includes(q)) return false;
    if (filter === 'active') return p.activeTaskCount > 0;
    return true;
  });
}

export default function ProjectsScreen() {
  const { status, data, error, refetch } = useProjects();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const visible = useMemo(() => (data ? filterProjects(data, filter, query) : []), [data, filter, query]);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: tokens.color.text }}>Projects</Text>
          <Pressable
            testID="projects.new"
            accessibilityLabel="Create new project"
            onPress={() => router.push('/projects/new')}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: tokens.radius.pill,
              backgroundColor: tokens.color.primary,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>New project</Text>
          </Pressable>
        </View>

        <TextInput
          testID="projects.search"
          accessibilityLabel="Search projects"
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name"
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
                testID={`projects.filter.${f.key}`}
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
          <View testID="projects.loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <ActivityIndicator color={tokens.color.primary} />
            <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading projects…</Text>
          </View>
        ) : null}

        {status === 'error' ? (
          <View testID="projects.error" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load projects</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
            <Pressable
              testID="projects.retry"
              accessibilityLabel="Retry loading projects"
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
          <View testID="projects.empty" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>
              No projects yet
            </Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>
              Create your first project to get started.
            </Text>
            <Pressable
              testID="projects.empty.cta"
              accessibilityLabel="Create project"
              onPress={() => router.push('/projects/new')}
              style={{
                marginTop: 16,
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: tokens.radius.md,
                backgroundColor: tokens.color.primary,
              }}
            >
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Create project</Text>
            </Pressable>
          </View>
        ) : null}

        {status === 'loaded' ? (
          <FlatList
            testID="projects.list"
            data={visible}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={{ padding: 24, alignItems: 'center' }}>
                <Text style={{ color: tokens.color.textMuted }}>No projects match the current filters.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                testID={`projects.item.${item.id}`}
                accessibilityLabel={`Open project ${item.name}`}
                onPress={() => router.push(`/projects/${item.id}`)}
                style={{
                  backgroundColor: tokens.color.surface,
                  borderRadius: tokens.radius.lg,
                  padding: 16,
                  marginBottom: 12,
                }}
              >
                <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text }}>
                  {item.name}
                </Text>
                <Text style={{ marginTop: 4, color: tokens.color.textMuted }}>{item.repoPath}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: tokens.color.primary, fontWeight: '700' }}>
                    {item.activeTaskCount} active task{item.activeTaskCount === 1 ? '' : 's'}
                  </Text>
                  <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                    {formatUpdated(item.updatedAt)}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        ) : null}
      </View>
    </View>
  );
}
