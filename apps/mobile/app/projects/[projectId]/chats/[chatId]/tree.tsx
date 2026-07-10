import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { Checkpoint } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { CheckpointTree } from '@/features/checkpoints/CheckpointTree';

const MOCK_CHECKPOINTS: Checkpoint[] = [
  {
    id: 'preview-1',
    taskId: 'preview',
    message: 'Initial implementation',
    sha: 'a1b2c3d4e5f6',
    changedFiles: 3,
    createdAt: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'preview-2',
    taskId: 'preview',
    message: 'Refactored handler',
    sha: '9f8e7d6c5b4a',
    changedFiles: 1,
    createdAt: '2026-01-01T11:30:00.000Z',
  },
];

const noop = (): void => {};

export default function ChatTreeScreen() {
  return (
    <ScrollView
      testID="chatTree.screen"
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View
        testID="chatTree.empty"
        style={{
          backgroundColor: tokens.color.surface,
          borderRadius: tokens.radius.lg,
          padding: 16,
          borderWidth: 1,
          borderColor: tokens.color.border,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md }}>
          Выберите задачу для просмотра дерева сессии
        </Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 6, fontSize: tokens.fontSize.sm }}>
          Дерево контрольных точек привязано к задаче. Откройте задачу, чтобы увидеть её чекпоинты, форки и
          откаты.
        </Text>
        <Pressable
          testID="chatTree.backToChats"
          accessibilityRole="button"
          accessibilityLabel="Назад к чатам"
          onPress={() => router.back()}
          style={{
            marginTop: 12,
            alignSelf: 'flex-start',
            paddingVertical: 8,
            paddingHorizontal: 14,
            borderRadius: tokens.radius.md,
            backgroundColor: tokens.color.primary,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: tokens.fontSize.sm }}>К чатам</Text>
        </Pressable>
      </View>

      <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginBottom: 8 }}>
        Предпросмотр структуры:
      </Text>
      <View style={{ height: 360 }}>
        <CheckpointTree
          checkpoints={MOCK_CHECKPOINTS}
          activeCheckpointId="preview-2"
          onFork={noop}
          onRollback={noop}
          onViewDiff={noop}
        />
      </View>
    </ScrollView>
  );
}
