import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { useTask } from '@/features/tasks/useTasks';
import { TaskStatusBadge } from '@/features/tasks/TaskStatusBadge';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';
import {
  canMerge,
  checksSummaryFor,
  defaultCommitMessage,
  isConflict,
  STRATEGY_OPTIONS,
  type MergeStrategy,
} from '@/features/merge/mergeRules';

const CHECKS_TEXT = { running: 'Checks running…', failed: 'Checks failed', passed: 'Checks passed' } as const;

export default function MergeScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data: task, status, error, refetch } = useTask(taskId);
  const { baseUrl } = useBackend();
  const [strategy, setStrategy] = useState<MergeStrategy>('squash');
  const [commitMessage, setCommitMessage] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  if (status === 'loading') {
    return (
      <View
        testID="merge.loading"
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
        testID="merge.error"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load task</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
        <Pressable
          testID="merge.retry"
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

  const mergeable = canMerge(task.status);
  const conflict = isConflict(task.status);
  const checks = checksSummaryFor(task.status);
  const message = commitMessage ?? defaultCommitMessage(task.title);

  const handleSubmit = () => {
    if (!mergeable || !baseUrl) return;
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (!baseUrl) return;
    setPending(true);
    setSubmitError(null);
    const client = new ApiClient(baseUrl);
    client
      .mergeTask(taskId, { strategy, commitMessage: message })
      .then(() => {
        setDone(true);
        setConfirmOpen(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setSubmitError(msg);
      })
      .finally(() => setPending(false));
  };

  const handleDone = () => {
    if (router.canGoBack()) router.back();
    else router.replace('.');
  };

  if (done) {
    return (
      <View
        testID="merge.success"
        style={{ flex: 1, backgroundColor: tokens.color.background, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Text style={{ color: tokens.color.successText, fontWeight: '700', fontSize: tokens.fontSize.lg }}>Слияние выполнено</Text>
        <Pressable
          testID="merge.done"
          accessibilityRole="button"
          accessibilityLabel="Готово"
          onPress={handleDone}
          style={{
            marginTop: 16,
            paddingVertical: 10,
            paddingHorizontal: 18,
            borderRadius: tokens.radius.md,
            backgroundColor: tokens.color.primary,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Готово</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      testID="merge.screen"
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: tokens.fontSize.lg, fontWeight: '700', color: tokens.color.text, flex: 1 }} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={{ marginLeft: 8 }}>
          <TaskStatusBadge status={task.status} />
        </View>
      </View>
      <Text style={{ color: tokens.color.textMuted, marginTop: 4, fontSize: tokens.fontSize.sm }}>{task.branchName}</Text>

      {conflict ? (
        <Pressable
          testID="merge.conflictLink"
          accessibilityLabel="Open conflict resolver"
          onPress={() => router.push('./conflicts' as never)}
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
            Откройте resolver для разрешения конфликтов
          </Text>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md }}>Стратегия</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
          {STRATEGY_OPTIONS.map((opt) => {
            const active = opt.value === strategy;
            return (
              <Pressable
                key={opt.value}
                testID={`merge.strategy.${opt.value}`}
                accessibilityRole="button"
                accessibilityLabel={`Strategy ${opt.label}`}
                onPress={() => setStrategy(opt.value)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  marginRight: 8,
                  marginBottom: 8,
                  borderRadius: tokens.radius.pill,
                  borderWidth: 1,
                  borderColor: active ? tokens.color.primary : tokens.color.border,
                  backgroundColor: active ? tokens.color.primary : tokens.color.surface,
                }}
              >
                <Text style={{ color: active ? '#FFFFFF' : tokens.color.textMuted, fontWeight: '700', fontSize: tokens.fontSize.sm }}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        testID="merge.checks"
        style={{
          marginTop: 16,
          backgroundColor: tokens.color.surface,
          borderRadius: tokens.radius.lg,
          padding: 16,
          borderWidth: 1,
          borderColor: tokens.color.border,
        }}
      >
        <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.sm }}>Checks</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, fontSize: tokens.fontSize.sm }}>{CHECKS_TEXT[checks]}</Text>
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md }}>Commit message</Text>
        <TextInput
          testID="merge.commitMessage"
          accessibilityLabel="Commit message"
          value={message}
          onChangeText={setCommitMessage}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="feat: merge …"
          placeholderTextColor={tokens.color.textMuted}
          style={{
            marginTop: 8,
            backgroundColor: tokens.color.surface,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderColor: tokens.color.border,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: tokens.color.text,
            fontSize: tokens.fontSize.sm,
            minHeight: 80,
            textAlignVertical: 'top',
          }}
        />
      </View>

      {submitError ? (
        <Text style={{ color: tokens.color.danger, marginTop: 12, fontSize: tokens.fontSize.sm }}>{submitError}</Text>
      ) : null}

      <Pressable
        testID="merge.submit"
        accessibilityRole="button"
        accessibilityLabel={mergeable ? 'Слить в repo' : 'Merge disabled'}
        onPress={handleSubmit}
        disabled={!mergeable || pending}
        style={{
          marginTop: 20,
          paddingVertical: 12,
          borderRadius: tokens.radius.md,
          backgroundColor: tokens.color.primary,
          alignItems: 'center',
          opacity: mergeable && !pending ? 1 : 0.5,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Слить в repo</Text>
      </Pressable>

      <Modal
        testID="merge.confirmDialog"
        visible={confirmOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmOpen(false)}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 20, width: '80%' }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>Слить в repo?</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>
              {`Стратегия: ${strategy}\nСообщение: ${message}`}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pressable
                testID="merge.confirm.cancel"
                accessibilityRole="button"
                accessibilityLabel="Отмена"
                onPress={() => setConfirmOpen(false)}
                disabled={pending}
                style={{ paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, opacity: pending ? 0.5 : 1 }}
              >
                <Text style={{ color: tokens.color.textMuted, fontWeight: '700' }}>Отмена</Text>
              </Pressable>
              <Pressable
                testID="merge.confirm"
                accessibilityRole="button"
                accessibilityLabel="Подтвердить"
                onPress={handleConfirm}
                disabled={pending}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.primary,
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Подтвердить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
