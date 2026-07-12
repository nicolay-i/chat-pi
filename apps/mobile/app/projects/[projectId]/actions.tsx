import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams } from '@/navigation';
import type { Action } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/stores/useBackend';

type Status = 'loading' | 'loaded' | 'empty' | 'error';

export default function ActionsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [actions, setActions] = useState<Action[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [pending, setPending] = useState<Action | null>(null);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl || !projectId) {
      setStatus('error');
      setError(!projectId ? 'Missing project id' : 'Backend URL is not configured');
      setActions([]);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getActions(projectId, { context: 'project' })
      .then((rows) => {
        if (!active) return;
        setActions(rows);
        setStatus(rows.length === 0 ? 'empty' : 'loaded');
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
  }, [baseUrl, projectId, nonce]);

  const runAction = (action: Action): void => {
    if (!baseUrl) return;
    setRunning(true);
    setToast(null);
    const client = new ApiClient(baseUrl);
    client
      .runAction(action.id)
      .then((run) => {
        setToast(`${action.label}: ${run.status}`);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setToast(`${action.label} failed: ${msg}`);
      })
      .finally(() => setRunning(false));
  };

  const handlePress = (action: Action): void => {
    if (action.hasSideEffect) {
      setPending(action);
      return;
    }
    runAction(action);
  };

  const handleConfirm = (): void => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    runAction(action);
  };

  if (status === 'loading') {
    return (
      <View testID="actions.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading actions…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="actions.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load actions</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          testID="actions.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading actions"
          style={styles.retry}
          onPress={refetch}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'empty') {
    return (
      <View testID="actions.empty" style={styles.center}>
        <Text style={styles.muted}>No actions available.</Text>
      </View>
    );
  }

  return (
    <ScrollView testID="actions.list" style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Actions</Text>
      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable
            key={action.id}
            testID={`actions.item.${action.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Run action ${action.label}`}
            style={[styles.chip, action.hasSideEffect ? styles.chipSideEffect : null]}
            onPress={() => handlePress(action)}
            disabled={running}
          >
            <Text style={styles.chipLabel}>
              {action.icon ? `${action.icon} ` : ''}
              {action.label}
            </Text>
            {action.hasSideEffect ? (
              <Text style={styles.chipTag}>side-effect</Text>
            ) : null}
          </Pressable>
        ))}
      </View>

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}

      <Modal
        testID="actions.confirm"
        visible={pending !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPending(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {pending?.confirmMessage ?? `Выполнить «${pending?.label ?? ''}»?`}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                testID="actions.confirm.cancel"
                accessibilityRole="button"
                accessibilityLabel="Отмена"
                onPress={() => setPending(null)}
                style={[styles.modalBtn, { backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border }]}
              >
                <Text style={[styles.modalBtnText, { color: tokens.color.textMuted }]}>Отмена</Text>
              </Pressable>
              <Pressable
                testID="actions.confirm.ok"
                accessibilityRole="button"
                accessibilityLabel="Выполнить"
                onPress={handleConfirm}
                style={[styles.modalBtn, { backgroundColor: tokens.color.primary }]}
              >
                <Text style={[styles.modalBtnText, { color: '#FFFFFF' }]}>Выполнить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background,
    padding: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  muted: {
    color: tokens.color.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  danger: {
    color: tokens.color.danger,
    fontWeight: '700',
  },
  retry: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  chip: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSideEffect: {
    borderColor: tokens.color.primary,
  },
  chipLabel: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  chipTag: {
    color: tokens.color.primary,
    fontSize: tokens.fontSize.xs,
    marginTop: 2,
    fontWeight: '700',
  },
  toast: {
    color: tokens.color.textMuted,
    marginTop: 16,
    fontSize: tokens.fontSize.sm,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 20,
    width: '80%',
  },
  modalTitle: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.lg,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  modalBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    marginLeft: 8,
  },
  modalBtnText: {
    fontWeight: '700',
    fontSize: tokens.fontSize.md,
  },
});
