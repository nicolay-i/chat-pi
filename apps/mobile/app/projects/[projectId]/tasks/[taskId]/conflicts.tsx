import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from '@/navigation';
import { tokens } from '@/theme/tokens';
import { useTask } from '@/features/tasks/useTasks';
import { TaskStatusBadge } from '@/features/tasks/TaskStatusBadge';

export default function ConflictsScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task, status, error, refetch } = useTask(taskId);

  if (status === 'loading') {
    return (
      <View
        testID="conflict.loading"
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
        testID="conflict.error"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load task</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
        <Pressable
          testID="conflict.retry"
          accessibilityRole="button"
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

  if (task.status !== 'merge_conflict') {
    return (
      <View
        testID="conflict.none"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Конфликтов нет</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>
          У задачи нет активных конфликтов слияния.
        </Text>
      </View>
    );
  }

  const abort = () => {
    if (router.canGoBack()) router.back();
    else router.replace('./merge' as never);
  };

  return (
    <ScrollView
      testID="conflict.screen"
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text, flex: 1 }}>
          {task.title}
        </Text>
        <View style={{ marginLeft: 8 }}>
          <TaskStatusBadge status={task.status} />
        </View>
      </View>

      <View
        style={{
          marginTop: 16,
          backgroundColor: '#FFECEC',
          borderRadius: tokens.radius.lg,
          padding: 16,
          borderWidth: 1,
          borderColor: tokens.color.danger,
        }}
      >
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Конфликт слияния</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, fontSize: tokens.fontSize.sm }}>
          Разрешите конфликты или прервите merge.
        </Text>
      </View>

      <View
        testID="conflict.unsupported"
        style={{
          marginTop: 16,
          backgroundColor: tokens.color.surface,
          borderRadius: tokens.radius.lg,
          padding: 16,
          borderWidth: 1,
          borderColor: tokens.color.border,
        }}
      >
        <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Разрешение по файлам недоступно</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, fontSize: tokens.fontSize.sm }}>
          Этот backend пока не публикует конфликтующие файлы и не предоставляет VSCode Web. Прервите merge, затем rebase или fork задачу после исправления рабочей копии.
        </Text>
      </View>

      <Pressable
        testID="conflict.action.abort"
        accessibilityRole="button"
        accessibilityLabel="Abort merge"
        onPress={abort}
        style={{
          marginTop: 20,
          paddingVertical: 12,
          borderRadius: tokens.radius.md,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: tokens.color.danger,
          backgroundColor: tokens.color.surface,
        }}
      >
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Прервать merge</Text>
      </Pressable>
    </ScrollView>
  );
}
