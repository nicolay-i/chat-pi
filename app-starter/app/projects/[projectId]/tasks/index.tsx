import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Task } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { useTasks } from '@/features/tasks/useTasks';
import {
  groupTasksByStatus,
  SECTION_LABELS,
  SECTION_ORDER,
  type TaskGroups,
} from '@/features/tasks/taskGroups';
import { TaskStatusBadge } from '@/features/tasks/TaskStatusBadge';

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

type SectionEntry = { key: keyof TaskGroups; tasks: Task[] };

function buildSections(groups: TaskGroups): SectionEntry[] {
  return SECTION_ORDER.map((key) => ({ key, tasks: groups[key] })).filter((s) => s.tasks.length > 0);
}

export default function TasksScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { status, data, error, refetch } = useTasks(projectId);

  const sections = data ? buildSections(groupTasksByStatus(data)) : [];
  const anyTasks = data !== null && data.length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 28, fontWeight: '700', color: tokens.color.text }}>Tasks</Text>
          <Pressable
            testID="tasks.new"
            accessibilityLabel="Start new task"
            onPress={() => router.push(`/projects/${projectId}/chats/new`)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderRadius: tokens.radius.pill,
              backgroundColor: tokens.color.primary,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>New task</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1, marginTop: 12 }}>
        {status === 'loading' ? (
          <View testID="tasks.loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <ActivityIndicator color={tokens.color.primary} />
            <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading tasks…</Text>
          </View>
        ) : null}

        {status === 'error' ? (
          <View testID="tasks.error" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load tasks</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
            <Pressable
              testID="tasks.retry"
              accessibilityLabel="Retry loading tasks"
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
          <View testID="tasks.empty" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>No tasks yet</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>
              Start a new chat to create a task.
            </Text>
          </View>
        ) : null}

        {status === 'loaded' && !anyTasks ? (
          <View testID="tasks.empty" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Text style={{ color: tokens.color.textMuted }}>No tasks to show.</Text>
          </View>
        ) : null}

        {status === 'loaded' && anyTasks ? (
          <FlatList
            testID="tasks.list"
            data={sections}
            keyExtractor={(item) => item.key}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
            renderItem={({ item: section }) => (
              <View testID={`tasks.section.${section.key}`} style={{ marginTop: 16 }}>
                <Text
                  style={{
                    color: tokens.color.textMuted,
                    fontWeight: '700',
                    fontSize: tokens.fontSize.sm,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {SECTION_LABELS[section.key]} ({section.tasks.length})
                </Text>
                <View style={{ marginTop: 8 }}>
                  {section.tasks.map((task) => (
                    <Pressable
                      key={task.id}
                      testID={`tasks.item.${task.id}`}
                      accessibilityLabel={`Open task ${task.title}`}
                      onPress={() => router.push(`/projects/${projectId}/tasks/${task.id}`)}
                      style={{
                        backgroundColor: tokens.color.surface,
                        borderRadius: tokens.radius.lg,
                        padding: 16,
                        marginBottom: 12,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text
                          style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text, flex: 1 }}
                          numberOfLines={1}
                        >
                          {task.title}
                        </Text>
                        <View style={{ marginLeft: 8 }}>
                          <TaskStatusBadge status={task.status} />
                        </View>
                      </View>
                      <Text style={{ marginTop: 4, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }} numberOfLines={1}>
                        {task.branchName}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                        <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                          {task.changedFiles} changed
                        </Text>
                        <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                          {formatUpdated(task.updatedAt)}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          />
        ) : null}
      </View>
    </View>
  );
}
