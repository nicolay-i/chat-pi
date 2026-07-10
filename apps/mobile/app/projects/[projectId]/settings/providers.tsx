import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Provider, ProviderTestResult } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';

type Status = 'loading' | 'loaded' | 'error';
type ProviderType = 'openai' | 'anthropic' | 'google' | 'custom';
const PROVIDER_TYPES: ProviderType[] = ['openai', 'anthropic', 'google', 'custom'];

const SECRET_MASK = '••••';

export default function ProvidersScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, ProviderTestResult>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl || !projectId) {
      setStatus('error');
      setError(!projectId ? 'Missing project id' : 'Backend URL is not configured');
      setProviders([]);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getProviders(projectId)
      .then((rows) => {
        if (!active) return;
        setProviders(rows);
        setStatus('loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, projectId, nonce]);

  const handleTest = async (providerId: string): Promise<void> => {
    if (!baseUrl || !projectId) return;
    setTestingId(providerId);
    const client = new ApiClient(baseUrl);
    try {
      const result = await client.testProvider(projectId, providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: result }));
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { ok: false, modelsFound: [], error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleCreated = (): void => {
    setAddOpen(false);
    refetch();
  };

  if (status === 'loading') {
    return (
      <View testID="providers.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading providers…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="providers.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load providers</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          testID="providers.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading providers"
          style={styles.retry}
          onPress={refetch}
        >
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      testID="providers.list"
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Providers</Text>
        <Pressable
          testID="providers.add"
          accessibilityRole="button"
          accessibilityLabel="Add provider"
          style={styles.headerBtn}
          onPress={() => setAddOpen(true)}
        >
          <Text style={styles.headerBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {providers.length === 0 ? (
        <View testID="providers.empty" style={styles.center}>
          <Text style={styles.muted}>No providers configured.</Text>
        </View>
      ) : null}

      {providers.map((provider) => {
        const result = testResults[provider.id];
        return (
          <View key={provider.id} style={styles.row} testID={`providers.item.${provider.id}`}>
            <Text style={styles.rowName}>{provider.type}</Text>
            {provider.baseUrl ? (
              <Text style={styles.rowMeta} numberOfLines={1}>
                {provider.baseUrl}
              </Text>
            ) : null}
            <Text style={styles.badge}>
              {provider.hasSecret ? `secret: ${SECRET_MASK}` : 'no secret'}
            </Text>
            <Text style={styles.rowMeta}>{provider.models.length} models</Text>

            <Pressable
              testID={`providers.test.${provider.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Test ${provider.type} connection`}
              style={[styles.headerBtn, { marginTop: 8, alignSelf: 'flex-start' }]}
              disabled={testingId === provider.id}
              onPress={() => handleTest(provider.id)}
            >
              {testingId === provider.id ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.headerBtnText}>Test connection</Text>
              )}
            </Pressable>

            {result ? (
              <View style={styles.testResult}>
                <Text style={{ color: result.ok ? tokens.color.successText : tokens.color.danger, fontWeight: '700' }}>
                  {result.ok ? 'Connection OK' : 'Connection failed'}
                </Text>
                {result.modelsFound.length > 0 ? (
                  <Text style={styles.rowMeta}>{result.modelsFound.length} models found</Text>
                ) : null}
                {result.error ? <Text style={styles.danger}>{result.error}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <Modal
        testID="providers.addModal"
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <AddProviderForm
              onCancel={() => setAddOpen(false)}
              onSaved={handleCreated}
              baseUrl={baseUrl}
              projectId={projectId}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function AddProviderForm({
  baseUrl,
  projectId,
  onCancel,
  onSaved,
}: {
  baseUrl: string | null;
  projectId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<ProviderType>('openai');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    if (!baseUrl) {
      setFormError('Backend URL is not configured');
      return;
    }
    setFormError(null);
    setBusy(true);
    const client = new ApiClient(baseUrl);
    try {
      await client.createProvider(projectId, {
        type,
        baseUrl: baseUrlInput.trim() || undefined,
        hasSecret: apiKey.trim().length > 0,
        models: [],
      });
      onSaved();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setApiKey('');
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.modalTitle}>Add provider</Text>

      <Text style={styles.label}>Type</Text>
      <View style={styles.typeRow}>
        {PROVIDER_TYPES.map((t) => (
          <Pressable
            key={t}
            testID={`providers.type.${t}`}
            accessibilityRole="button"
            accessibilityLabel={`Type ${t}`}
            onPress={() => setType(t)}
            style={[styles.typePill, type === t ? styles.typePillActive : null]}
          >
            <Text style={{ color: type === t ? '#FFFFFF' : tokens.color.textMuted, fontWeight: '700' }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Base URL</Text>
      <TextInput
        testID="providers.baseUrl"
        style={styles.input}
        value={baseUrlInput}
        onChangeText={setBaseUrlInput}
        placeholder="https://api.example.com/v1"
        placeholderTextColor={tokens.color.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>API key</Text>
      <TextInput
        testID="providers.apiKey"
        accessibilityLabel="API key"
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="sk-…"
        placeholderTextColor={tokens.color.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      {formError ? <Text style={styles.danger}>{formError}</Text> : null}

      <View style={styles.modalActions}>
        <Pressable
          testID="providers.cancel"
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={styles.cancelBtn}
          onPress={onCancel}
          disabled={busy}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          testID="providers.save"
          accessibilityRole="button"
          accessibilityLabel="Save provider"
          style={styles.saveBtn}
          onPress={handleSave}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save</Text>}
        </Pressable>
      </View>
    </View>
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
    marginTop: 8,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.text,
  },
  headerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
  },
  headerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
  },
  row: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  rowName: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  rowMeta: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: 2,
  },
  badge: {
    color: tokens.color.primary,
    fontSize: tokens.fontSize.xs,
    marginTop: 4,
    fontWeight: '700',
  },
  testResult: {
    marginTop: 8,
    padding: 8,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surfaceMuted,
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
    width: '85%',
  },
  modalTitle: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.lg,
    marginBottom: 8,
  },
  label: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: tokens.color.textMuted,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: tokens.color.surface,
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typePill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  typePillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  cancelText: {
    color: tokens.color.textMuted,
    fontWeight: '700',
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
