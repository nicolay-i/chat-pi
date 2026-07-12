import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from '@/navigation';
import type { DiffEntry } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { useCheckpoints } from '@/features/checkpoints/useCheckpoints';
import { CheckpointTree } from '@/features/checkpoints/CheckpointTree';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/stores/useBackend';

type Confirm = { kind: 'fork' | 'rollback'; checkpointId: string } | null;

export default function CheckpointsScreen() {
  const { taskId } = useLocalSearchParams<{ taskId: string }>();
  const { data, status, error, refetch } = useCheckpoints(taskId);
  const { baseUrl } = useBackend();

  const [createOpen, setCreateOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [diffFor, setDiffFor] = useState<string | null>(null);
  const [diffEntries, setDiffEntries] = useState<DiffEntry[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const handleCreate = () => {
    if (!baseUrl || !message.trim()) return;
    setCreating(true);
    setActionError(null);
    const client = new ApiClient(baseUrl);
    client
      .createCheckpoint(taskId, { message: message.trim() })
      .then(() => {
        setMessage('');
        setCreateOpen(false);
        refetch();
      })
      .catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setCreating(false));
  };

  const handleConfirm = () => {
    if (!confirm || !baseUrl) return;
    setPending(true);
    setActionError(null);
    const client = new ApiClient(baseUrl);
    const op =
      confirm.kind === 'fork'
        ? client.forkCheckpoint(taskId, confirm.checkpointId)
        : client.rollbackCheckpoint(taskId, confirm.checkpointId);
    op
      .then(() => {
        setConfirm(null);
        refetch();
      })
      .catch((err: unknown) => {
        setActionError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPending(false));
  };

  const handleViewDiff = (checkpointId: string) => {
    if (!baseUrl) return;
    setDiffFor(checkpointId);
    setDiffEntries(null);
    setDiffError(null);
    setDiffLoading(true);
    const client = new ApiClient(baseUrl);
    client
      .getCheckpointDiff(taskId, checkpointId)
      .then((entries) => {
        setDiffEntries(entries);
      })
      .catch((err: unknown) => {
        setDiffError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setDiffLoading(false));
  };

  if (status === 'loading') {
    return (
      <View
        testID="checkpoint.loading"
        style={{
          flex: 1,
          backgroundColor: tokens.color.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading checkpoints…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View
        testID="checkpoint.error"
        style={{
          flex: 1,
          backgroundColor: tokens.color.background,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load checkpoints</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
        <Pressable
          testID="checkpoint.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading checkpoints"
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

  return (
    <View testID="checkpoint.screen" style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 12 }}>
        <Pressable
          testID="checkpoint.create"
          accessibilityRole="button"
          accessibilityLabel="Create checkpoint"
          onPress={() => setCreateOpen(true)}
          style={{
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: tokens.radius.md,
            backgroundColor: tokens.color.primary,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Create checkpoint</Text>
        </Pressable>
        {actionError ? (
          <Text style={{ color: tokens.color.danger, marginTop: 8, fontSize: tokens.fontSize.sm }}>
            {actionError}
          </Text>
        ) : null}
      </View>

      {status === 'empty' || !data || data.length === 0 ? (
        <View
          testID="checkpoint.empty"
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Text style={{ color: tokens.color.text, fontWeight: '700' }}>No checkpoints</Text>
          <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>
            Create a checkpoint to capture the current task state.
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, marginTop: 8 }}>
          <CheckpointTree
            checkpoints={data}
            onFork={(id) => setConfirm({ kind: 'fork', checkpointId: id })}
            onRollback={(id) => setConfirm({ kind: 'rollback', checkpointId: id })}
            onViewDiff={handleViewDiff}
          />
        </View>
      )}

      <Modal
        testID="checkpoint.createDialog"
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 20, width: '80%' }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>
              New checkpoint
            </Text>
            <TextInput
              testID="checkpoint.createInput"
              accessibilityLabel="Checkpoint message"
              value={message}
              onChangeText={setMessage}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Message describing this checkpoint"
              placeholderTextColor={tokens.color.textMuted}
              style={{
                marginTop: 12,
                backgroundColor: tokens.color.surfaceMuted,
                borderRadius: tokens.radius.md,
                borderWidth: 1,
                borderColor: tokens.color.border,
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: tokens.color.text,
                fontSize: tokens.fontSize.sm,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pressable
                testID="checkpoint.create.cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setCreateOpen(false)}
                disabled={creating}
                style={{ paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, opacity: creating ? 0.5 : 1 }}
              >
                <Text style={{ color: tokens.color.textMuted, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="checkpoint.create.confirm"
                accessibilityRole="button"
                accessibilityLabel="Create checkpoint"
                onPress={handleCreate}
                disabled={creating || !message.trim()}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.primary,
                  opacity: creating || !message.trim() ? 0.5 : 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        testID="checkpoint.confirmDialog"
        visible={confirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirm(null)}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 20, width: '80%' }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>
              {confirm?.kind === 'fork' ? 'Fork?' : 'Rollback?'}
            </Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>
              {confirm?.kind === 'fork'
                ? 'Fork from this checkpoint?'
                : 'Откат создаст новую задачу. Продолжить?'}
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pressable
                testID="checkpoint.confirm.cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setConfirm(null)}
                disabled={pending}
                style={{ paddingVertical: 8, paddingHorizontal: 14, marginRight: 8, opacity: pending ? 0.5 : 1 }}
              >
                <Text style={{ color: tokens.color.textMuted, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="checkpoint.confirm.confirm"
                accessibilityRole="button"
                accessibilityLabel={confirm?.kind === 'fork' ? 'Fork' : 'Rollback'}
                onPress={handleConfirm}
                disabled={pending}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: tokens.radius.md,
                  backgroundColor: confirm?.kind === 'rollback' ? tokens.color.danger : tokens.color.primary,
                  opacity: pending ? 0.6 : 1,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Confirm</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        testID="checkpoint.diffDialog"
        visible={diffFor !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDiffFor(null)}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.lg, padding: 20, width: '85%', maxHeight: '70%' }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>
              Checkpoint diff
            </Text>
            {diffLoading ? (
              <View style={{ paddingVertical: 16, alignItems: 'center' }}>
                <ActivityIndicator color={tokens.color.primary} />
                <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>
                  Loading diff…
                </Text>
              </View>
            ) : diffError ? (
              <Text style={{ color: tokens.color.danger, marginTop: 8, fontSize: tokens.fontSize.sm }}>{diffError}</Text>
            ) : !diffEntries || diffEntries.length === 0 ? (
              <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>
                No changed files in this checkpoint.
              </Text>
            ) : (
              <ScrollView style={{ marginTop: 8 }}>
                {diffEntries.map((entry) => (
                  <View
                    key={entry.path}
                    style={{
                      flexDirection: 'row',
                      paddingVertical: 6,
                      borderBottomWidth: 1,
                      borderBottomColor: tokens.color.border,
                    }}
                  >
                    <Text
                      style={{ color: tokens.color.text, fontSize: tokens.fontSize.sm, flex: 1 }}
                      numberOfLines={1}
                    >
                      {entry.path}
                    </Text>
                    <Text style={{ color: tokens.color.successText, fontSize: tokens.fontSize.xs, marginLeft: 8 }}>
                      +{entry.additions}
                    </Text>
                    <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.xs, marginLeft: 6 }}>
                      −{entry.deletions}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 }}>
              <Pressable
                testID="checkpoint.diff.close"
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={() => setDiffFor(null)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: tokens.radius.md,
                  backgroundColor: tokens.color.primary,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
