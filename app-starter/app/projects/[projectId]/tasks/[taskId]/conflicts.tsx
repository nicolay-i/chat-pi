import { ActivityIndicator, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { useTask } from '@/features/tasks/useTasks';
import { TaskStatusBadge } from '@/features/tasks/TaskStatusBadge';

type ConflictFile = {
  path: string;
  body: string;
};

const CONFLICT_FILES: ConflictFile[] = [
  {
    path: 'src/example.ts',
    body: [
      '<<<<<<< HEAD',
      'export function add(a, b) {',
      '  return a + b;',
      '}',
      '=======',
      'export const add = (a, b) => a + b;',
      '>>>>>>> feature/branch',
    ].join('\n'),
  },
];

const ACTIONS: ReadonlyArray<{ name: string; label: string }> = [
  { name: 'ours', label: 'Оставить ours' },
  { name: 'theirs', label: 'Оставить theirs' },
  { name: 'agent', label: 'Попросить агента' },
];

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

  const openVscode = () => {
    void Linking.openURL('./vscode').catch(() => {
      router.push('./vscode' as never);
    });
  };

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

      {CONFLICT_FILES.map((file, index) => (
        <View
          key={file.path}
          testID={`conflict.file.${index}`}
          style={{
            marginTop: 16,
            backgroundColor: tokens.color.surface,
            borderRadius: tokens.radius.lg,
            padding: 12,
            borderWidth: 1,
            borderColor: tokens.color.border,
          }}
        >
          <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.sm }}>{file.path}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 8 }}
            contentContainerStyle={{ paddingVertical: 4 }}
          >
            <Text
              style={{
                fontFamily: 'monospace',
                color: tokens.color.textMuted,
                fontSize: tokens.fontSize.xs,
                lineHeight: 16,
              }}
            >
              {file.body}
            </Text>
          </ScrollView>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
            {ACTIONS.map((action) => (
              <Pressable
                key={action.name}
                testID={`conflict.action.${action.name}`}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => {
                  // placeholder; no real per-file API yet
                }}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  marginRight: 8,
                  marginBottom: 8,
                  borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.surfaceMuted,
                }}
              >
                <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.sm }}>{action.label}</Text>
              </Pressable>
            ))}
            <Pressable
              testID="conflict.action.vscode"
              accessibilityRole="link"
              accessibilityLabel="Open in VSCode Web"
              onPress={openVscode}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginRight: 8,
                marginBottom: 8,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.color.primary,
                backgroundColor: tokens.color.surface,
              }}
            >
              <Text style={{ color: tokens.color.primary, fontWeight: '700', fontSize: tokens.fontSize.sm }}>Открыть в VSCode Web</Text>
            </Pressable>
          </View>
        </View>
      ))}

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
