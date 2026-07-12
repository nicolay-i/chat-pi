import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from '@/navigation';
import type { Checkpoint, Task } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { CheckpointTree } from '@/features/checkpoints/CheckpointTree';
import { useBackend } from '@/stores/useBackend';
import { tokens } from '@/theme/tokens';

type LoadStatus = 'loading' | 'loaded' | 'error';

export default function ChatTreeScreen() {
  const { projectId, chatId } = useLocalSearchParams<{ projectId: string; chatId: string }>();
  const { baseUrl } = useBackend();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => baseUrl ? new ApiClient(baseUrl) : null, [baseUrl]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

  const loadTree = useCallback(async () => {
    if (!client || !chatId) {
      setStatus('error');
      setError('Backend URL is not configured');
      return;
    }
    setStatus('loading');
    setError(null);
    try {
      const nextTasks = await client.getChatTree(chatId);
      setTasks(nextTasks);
      setSelectedTaskId((current) => current && nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id ?? null);
      setStatus('loaded');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [chatId, client]);

  const loadCheckpoints = useCallback(async () => {
    if (!client || !selectedTaskId) {
      setCheckpoints([]);
      return;
    }
    try {
      setCheckpoints(await client.getCheckpoints(selectedTaskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, selectedTaskId]);

  useEffect(() => { void loadTree(); }, [loadTree]);
  useEffect(() => { void loadCheckpoints(); }, [loadCheckpoints]);

  const refresh = async (): Promise<void> => {
    await loadTree();
    await loadCheckpoints();
  };

  if (status === 'loading') {
    return <Centered testID="chatTree.loading" text="Loading session tree…" />;
  }
  if (status === 'error') {
    return (
      <Centered testID="chatTree.error" text={error ?? 'Unable to load session tree'} actionLabel="Retry" onAction={() => void loadTree()} />
    );
  }
  if (tasks.length === 0) {
    return (
      <Centered testID="chatTree.empty" text="This chat has no implementation tasks yet." actionLabel="Back to chats" onAction={() => router.back()} />
    );
  }

  return (
    <ScrollView testID="chatTree.screen" style={{ flex: 1, backgroundColor: tokens.color.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>Session tree</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 16 }}>
        {tasks.map((task) => (
          <Pressable
            key={task.id}
            testID={`chatTree.task.${task.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Select task ${task.title}`}
            onPress={() => setSelectedTaskId(task.id)}
            style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: tokens.radius.md, backgroundColor: task.id === selectedTaskId ? tokens.color.primary : tokens.color.surfaceMuted }}
          >
            <Text style={{ color: task.id === selectedTaskId ? '#FFFFFF' : tokens.color.text, fontSize: tokens.fontSize.sm }}>{task.title}</Text>
          </Pressable>
        ))}
      </View>
      {selectedTask ? (
        <View style={{ height: 420 }}>
          <CheckpointTree
            checkpoints={checkpoints}
            activeCheckpointId={checkpoints.at(-1)?.id}
            onFork={(checkpointId) => { if (client) void client.forkCheckpoint(selectedTask.id, checkpointId).then(refresh).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))); }}
            onRollback={(checkpointId) => { if (client) void client.rollbackCheckpoint(selectedTask.id, checkpointId).then(refresh).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))); }}
            onViewDiff={() => router.push(`/projects/${projectId}/tasks/${selectedTask.id}/diff`)}
          />
        </View>
      ) : null}
      {error ? <Text style={{ color: tokens.color.danger, marginTop: 12 }}>{error}</Text> : null}
    </ScrollView>
  );
}

function Centered({ testID, text, actionLabel, onAction }: { testID: string; text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: tokens.color.background, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
      {testID === 'chatTree.loading' ? <ActivityIndicator color={tokens.color.primary} /> : null}
      <Text style={{ color: tokens.color.textMuted, textAlign: 'center', marginTop: 12 }}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={{ marginTop: 16, paddingHorizontal: 14, paddingVertical: 9, borderRadius: tokens.radius.md, backgroundColor: tokens.color.primary }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
