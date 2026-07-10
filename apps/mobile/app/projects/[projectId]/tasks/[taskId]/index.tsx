import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { useTask } from '@/features/tasks/useTasks';
import { TaskStatusBadge } from '@/features/tasks/TaskStatusBadge';

type TabKey = 'overview' | 'chat' | 'diff' | 'checkpoints' | 'trace' | 'files' | 'merge';

const TABS: ReadonlyArray<{ key: TabKey; label: string; route?: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'chat', label: 'Chat' },
  { key: 'diff', label: 'Diff', route: './diff' },
  { key: 'checkpoints', label: 'Checkpoints', route: './checkpoints' },
  { key: 'trace', label: 'Trace' },
  { key: 'files', label: 'Files' },
  { key: 'merge', label: 'Merge', route: './merge' },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 8 }}>
      <Text style={{ color: tokens.color.textMuted, width: 120, fontSize: tokens.fontSize.sm }}>{label}</Text>
      <Text style={{ color: tokens.color.text, flex: 1, fontSize: tokens.fontSize.sm }}>{value}</Text>
    </View>
  );
}

export default function TaskDetailScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task, status, error, refetch } = useTask(taskId);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [dangerOpen, setDangerOpen] = useState(false);

  if (status === 'loading') {
    return (
      <View
        testID="taskDetail.loading"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading task…</Text>
      </View>
    );
  }

  if (status === 'error' || !task) {
    return (
      <View
        testID="taskDetail.error"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load task</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
        <Pressable
          testID="taskDetail.retry"
          accessibilityLabel="Retry loading task"
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
    );
  }

  const handleTab = (tab: (typeof TABS)[number]) => {
    if (tab.route) {
      router.push(tab.route as never);
      return;
    }
    setActiveTab(tab.key);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: tokens.color.background }} contentContainerStyle={{ padding: 16 }}>
      <View testID="taskDetail.header">
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text, flex: 1 }} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={{ marginLeft: 8 }}>
            <TaskStatusBadge status={task.status} />
          </View>
        </View>
        <Row label="Branch" value={task.branchName} />
        <Row label="Worktree" value={task.worktreePath} />
        <Row label="Changed files" value={String(task.changedFiles)} />
        <Row label="Updated" value={task.updatedAt} />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 16 }}
        contentContainerStyle={{ paddingVertical: 4 }}
      >
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              testID={`taskDetail.tabs.${tab.key}`}
              accessibilityLabel={`${tab.label} tab`}
              onPress={() => handleTab(tab)}
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
              <Text style={{ color: active ? '#FFFFFF' : tokens.color.textMuted, fontWeight: '700', fontSize: tokens.fontSize.sm }}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ marginTop: 16 }}>
        {activeTab === 'overview' ? (
          <View>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>Overview</Text>
            <Row label="Mode" value={task.mode} />
            <Row label="Source chat" value={task.sourceChatId ?? '—'} />
            <Row label="Task ID" value={task.id} />

            <View testID="taskDetail.runtimePanel" style={{ marginTop: 16, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 16 }}>
              <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md }}>Runtime</Text>
              <Row label="Current run" value="—" />
              <Row label="Active tool" value="—" />
              <Row label="Queue" value="—" />
              <Row label="Elapsed" value="—" />
              <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 8 }}>
                Realtime runtime metrics will appear here.
              </Text>
            </View>

            <Pressable
              testID="taskDetail.dangerousActions"
              accessibilityLabel="Toggle dangerous actions"
              onPress={() => setDangerOpen((v) => !v)}
              style={{
                marginTop: 16,
                backgroundColor: tokens.color.surface,
                borderRadius: tokens.radius.lg,
                padding: 16,
                borderWidth: 1,
                borderColor: tokens.color.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Dangerous actions</Text>
                <Text style={{ color: tokens.color.textMuted }}>{dangerOpen ? '▲' : '▼'}</Text>
              </View>
              {dangerOpen ? (
                <View style={{ marginTop: 12 }}>
                  <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                    Abort, rollback, and rebase actions are available here. Disabled while running.
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
        ) : null}

        {activeTab === 'chat' ? (
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 16 }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Chat</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>Steering and follow-ups will appear here.</Text>
          </View>
        ) : null}

        {activeTab === 'trace' ? (
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 16 }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Trace</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>Run trace events will appear here.</Text>
          </View>
        ) : null}

        {activeTab === 'files' ? (
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 16 }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Files</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>Changed files browser will appear here.</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
