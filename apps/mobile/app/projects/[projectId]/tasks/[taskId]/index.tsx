import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from '@/navigation';
import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { RuntimePanel } from '@/features/trace/RuntimePanel';
import { useBackend } from '@/stores/useBackend';
import { tokens } from '@/theme/tokens';
import { useTask } from '@/features/tasks/useTasks';
import { TaskStatusBadge } from '@/features/tasks/TaskStatusBadge';

type TabKey = 'overview' | 'diff' | 'checkpoints' | 'merge';
type TaskAction = 'abort' | 'rollback' | 'fork' | 'rebase' | 'cancel_archive' | 'cancel_discard';

const TABS: ReadonlyArray<{ key: TabKey; label: string; route?: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'diff', label: 'Diff', route: './diff' },
  { key: 'checkpoints', label: 'Checkpoints', route: './checkpoints' },
  { key: 'merge', label: 'Merge', route: './merge' },
];

const ACTION_COPY: Record<TaskAction, { label: string; title: string; description: string; destructive?: boolean }> = {
  abort: {
    label: 'Прервать запуск',
    title: 'Прервать текущий запуск?',
    description: 'Изменения в worktree сохранятся, задача перейдёт в paused-состояние.',
    destructive: true,
  },
  rollback: {
    label: 'Откатить к checkpoint',
    title: 'Создать задачу из последнего checkpoint?',
    description: 'Откат продолжится в этом же Chat и PiSession, но в новой Task и worktree.',
  },
  fork: {
    label: 'Создать fork',
    title: 'Создать независимый fork?',
    description: 'Будут созданы новый Chat, новая PiSession и отдельная Task от выбранной истории.',
  },
  rebase: {
    label: 'Rebase на актуальную базу',
    title: 'Выполнить rebase?',
    description: 'Операция изменит историю ветки Task и может привести к конфликту.',
    destructive: true,
  },
  cancel_archive: {
    label: 'Отменить и архивировать',
    title: 'Отменить Task с сохранением?',
    description: 'Ветка и worktree будут сохранены для последующего просмотра.',
    destructive: true,
  },
  cancel_discard: {
    label: 'Отменить и удалить worktree',
    title: 'Безвозвратно удалить worktree?',
    description: 'Незакоммиченные изменения и рабочая копия Task будут удалены.',
    destructive: true,
  },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 8 }}>
      <Text style={{ color: tokens.color.textMuted, width: 120, fontSize: tokens.fontSize.sm }}>{label}</Text>
      <Text style={{ color: tokens.color.text, flex: 1, fontSize: tokens.fontSize.sm }}>{value}</Text>
    </View>
  );
}

function TaskRuntimePanel({ taskId }: { taskId: string }) {
  const { baseUrl } = useBackend();
  const [events, setEvents] = useState<RealtimeEnvelope[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseUrl) return;
    let active = true;
    void new ApiClient(baseUrl).getTaskTrace(taskId)
      .then((next) => { if (active) setEvents(next); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : String(err)); });
    return () => { active = false; };
  }, [baseUrl, taskId]);

  return (
    <View testID="taskDetail.runtimePanel" style={{ marginTop: 16 }}>
      <RuntimePanel events={events} />
      {error ? <Text style={{ color: tokens.color.danger, marginTop: 6, fontSize: tokens.fontSize.sm }}>{error}</Text> : null}
    </View>
  );
}

export default function TaskDetailScreen() {
  const { projectId, taskId } = useLocalSearchParams<{ projectId: string; taskId: string }>();
  const { data: task, status, error, refetch } = useTask(taskId);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<TaskAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { baseUrl } = useBackend();

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

  const running = ['queued', 'running', 'aborting', 'checks_running', 'merge_running'].includes(task.status);
  const terminal = ['merged', 'cancelled_archived', 'cancelled_discarded', 'archived'].includes(task.status);

  const runAction = (): void => {
    if (!baseUrl || !confirmAction || actionBusy) return;
    const action = confirmAction;
    const client = new ApiClient(baseUrl);
    setActionBusy(true);
    setActionError(null);

    const operation = action === 'abort'
      ? client.abort(task.id)
      : action === 'rollback'
        ? client.rollbackTask(task.id)
        : action === 'fork'
          ? client.forkTask(task.id)
          : action === 'rebase'
            ? client.rebaseTask(task.id)
            : client.cancelTask(task.id, action === 'cancel_archive' ? 'archive' : 'discard');

    void operation
      .then((result) => {
        setConfirmAction(null);
        if ((action === 'rollback' || action === 'fork') && 'id' in result) {
          router.push(`/projects/${projectId}/tasks/${result.id}`);
          return;
        }
        refetch();
      })
      .catch((actionFailure: unknown) => setActionError(actionFailure instanceof Error ? actionFailure.message : String(actionFailure)))
      .finally(() => setActionBusy(false));
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

            <TaskRuntimePanel taskId={task.id} />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {task.sourceChatId ? (
                <Pressable testID="taskDetail.openChat" accessibilityLabel="Open task chat" onPress={() => router.push(`/projects/${projectId}/chats/${task.sourceChatId}`)} style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border }}>
                  <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Open chat</Text>
                </Pressable>
              ) : null}
              {task.sourceChatId ? (
                <Pressable testID="taskDetail.openTrace" accessibilityLabel="Open task trace" onPress={() => router.push(`/projects/${projectId}/chats/${task.sourceChatId}/trace`)} style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border }}>
                  <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Open trace</Text>
                </Pressable>
              ) : null}
              <Pressable testID="taskDetail.openDiff" accessibilityLabel="Open task diff" onPress={() => router.push(`./diff`)} style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: tokens.radius.md, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border }}>
                <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Open diff</Text>
              </Pressable>
            </View>

            <View
              style={{
                marginTop: 16,
                backgroundColor: tokens.color.surface,
                borderRadius: tokens.radius.lg,
                padding: 16,
                borderWidth: 1,
                borderColor: tokens.color.border,
              }}
            >
              <Pressable
                testID="taskDetail.dangerousActions"
                accessibilityRole="button"
                accessibilityLabel="Toggle dangerous actions"
                accessibilityState={{ expanded: dangerOpen }}
                onPress={() => setDangerOpen((v) => !v)}
                style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Dangerous actions</Text>
                <Text style={{ color: tokens.color.textMuted }}>{dangerOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {dangerOpen ? (
                <View testID="taskDetail.dangerousActions.panel" style={{ marginTop: 8, gap: 8 }}>
                  <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
                    Операции Git и отмена недоступны во время активного запуска. Abort сохраняет текущие файлы.
                  </Text>
                  {actionError ? <Text testID="taskDetail.action.error" style={{ color: tokens.color.danger, fontSize: tokens.fontSize.sm }}>{actionError}</Text> : null}
                  {(Object.keys(ACTION_COPY) as TaskAction[]).map((action) => {
                    const historyAction = action === 'rollback' || action === 'fork';
                    const disabled = actionBusy
                      || (action === 'abort' ? !running || task.status === 'aborting' : running)
                      || (terminal && !historyAction);
                    return (
                      <Pressable
                        key={action}
                        testID={`taskDetail.action.${action}`}
                        accessibilityRole="button"
                        accessibilityLabel={ACTION_COPY[action].label}
                        disabled={disabled}
                        onPress={() => setConfirmAction(action)}
                        style={{
                          minHeight: 44,
                          paddingHorizontal: 12,
                          justifyContent: 'center',
                          borderRadius: tokens.radius.md,
                          borderWidth: 1,
                          borderColor: ACTION_COPY[action].destructive ? tokens.color.danger : tokens.color.border,
                          opacity: disabled ? 0.4 : 1,
                        }}
                      >
                        <Text style={{ color: ACTION_COPY[action].destructive ? tokens.color.danger : tokens.color.text, fontWeight: '700' }}>
                          {ACTION_COPY[action].label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

      </View>

      <Modal
        testID="taskDetail.action.confirmDialog"
        visible={confirmAction !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!actionBusy) setConfirmAction(null); }}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ width: '100%', maxWidth: 460, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 20 }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>
              {confirmAction ? ACTION_COPY[confirmAction].title : ''}
            </Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>
              {confirmAction ? ACTION_COPY[confirmAction].description : ''}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Pressable
                testID="taskDetail.action.cancel"
                accessibilityRole="button"
                accessibilityLabel="Отмена"
                disabled={actionBusy}
                onPress={() => setConfirmAction(null)}
                style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', opacity: actionBusy ? 0.5 : 1 }}
              >
                <Text style={{ color: tokens.color.text }}>Отмена</Text>
              </Pressable>
              <Pressable
                testID="taskDetail.action.confirm"
                accessibilityRole="button"
                accessibilityLabel="Подтвердить действие"
                disabled={actionBusy}
                onPress={runAction}
                style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: tokens.radius.md, backgroundColor: confirmAction && ACTION_COPY[confirmAction].destructive ? tokens.color.danger : tokens.color.primary, opacity: actionBusy ? 0.5 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{actionBusy ? 'Выполняется…' : 'Подтвердить'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
