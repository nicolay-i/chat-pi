import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Link, useLocalSearchParams } from '@/navigation';
import type { Chat, Project } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { ApiClient } from '@/api/client';
import { observer } from '@/lib/observer';
import { useRootStore } from '@/providers/RootStoreProvider';
import { useBackend } from '@/stores/useBackend';

type Status = 'loading' | 'loaded' | 'error';

const ProjectDashboardScreen = observer(function ProjectDashboardScreen() {
  const { width } = useWindowDimensions();
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const { tasks: tasksStore } = useRootStore();
  const [project, setProject] = useState<Project | null>(null);
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = () => setNonce((n) => n + 1);

  useEffect(() => {
    if (!baseUrl) {
      setStatus('error');
      setError('Backend URL is not configured');
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    Promise.all([client.getProject(projectId), client.getChats(projectId), tasksStore.hydrateProject(projectId)])
      .then(([p, c]) => {
        if (!active) return;
        setProject(p);
        setChats(c);
        setStatus('loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, projectId, nonce, tasksStore]);

  if (status === 'loading') {
    return (
      <View testID="dashboard.loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tokens.color.background }}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading project…</Text>
      </View>
    );
  }

  if (status === 'error' || !project) {
    return (
      <View testID="dashboard.error" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tokens.color.background }}>
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load project</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
        <Pressable
          testID="dashboard.retry"
          accessibilityLabel="Retry loading project"
          onPress={refetch}
          style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 18, borderRadius: tokens.radius.md, backgroundColor: tokens.color.primary }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const activeTasks = tasksStore.byProject(projectId).filter((task) => task.isRunning);
  const lastChat = chats && chats.length > 0 ? chats[0] : null;

  const cardStyle = {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 16,
    marginTop: 12,
  };

  const sectionTitle = {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700' as const,
    color: tokens.color.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginTop: 16,
  };

  return (
    <ScrollView testID="dashboard.loaded" style={{ flex: 1, backgroundColor: tokens.color.background }} contentContainerStyle={{ padding: 16 }}>
      <View style={{ flexDirection: width < 520 ? 'column' : 'row', alignItems: width < 520 ? 'stretch' : 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text }}>{project.name}</Text>
          <Text style={{ color: tokens.color.textMuted, marginTop: 2 }}>{project.repoPath}</Text>
        </View>
        <Link href={`/projects/${projectId}/settings/project`} style={{ color: tokens.color.primary, fontWeight: '700', alignSelf: width < 520 ? 'flex-start' : 'auto' }}>
          Settings
        </Link>
      </View>

      <Text style={sectionTitle}>Chats</Text>
      <View style={cardStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text }}>
            {chats?.length ?? 0} chat{(chats?.length ?? 0) === 1 ? '' : 's'}
          </Text>
          <Link href={`/projects/${projectId}/chats`} style={{ color: tokens.color.primary, fontWeight: '700' }}>
            Open chats →
          </Link>
        </View>
        {lastChat ? (
          <View style={{ marginTop: 8, padding: 10, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surfaceMuted }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700' }}>{lastChat.title}</Text>
            {lastChat.lastMessagePreview ? (
              <Text style={{ color: tokens.color.textMuted, marginTop: 2 }} numberOfLines={1}>
                {lastChat.lastMessagePreview}
              </Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>No chats yet.</Text>
        )}
      </View>

      <Text style={sectionTitle}>Tasks</Text>
      <View style={cardStyle}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text }}>
            {activeTasks.length} active task{activeTasks.length === 1 ? '' : 's'}
          </Text>
          <Link href={`/projects/${projectId}/tasks`} style={{ color: tokens.color.primary, fontWeight: '700' }}>
            Open tasks →
          </Link>
        </View>
        {activeTasks.length > 0 ? (
          activeTasks.slice(0, 3).map((t) => (
            <View key={t.id} style={{ marginTop: 8, padding: 10, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surfaceMuted }}>
              <Text style={{ color: tokens.color.text, fontWeight: '700' }}>{t.title}</Text>
              <Text style={{ color: tokens.color.textMuted, marginTop: 2 }}>
                {t.status} · {t.changedFiles} changed file{t.changedFiles === 1 ? '' : 's'}
              </Text>
            </View>
          ))
        ) : (
          <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>No active tasks.</Text>
        )}
      </View>

      <Text style={sectionTitle}>More</Text>
      <View style={cardStyle}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Link href={`/projects/${projectId}/files`} style={{ color: tokens.color.primary, fontWeight: '700' }}>
            Files →
          </Link>
          <Link href={`/projects/${projectId}/actions`} style={{ color: tokens.color.primary, fontWeight: '700' }}>
            Actions →
          </Link>
        </View>
      </View>
    </ScrollView>
  );
});

export default ProjectDashboardScreen;
