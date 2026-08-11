import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from '@/navigation';
import { observer } from '@/lib/observer';
import { tokens } from '@/theme/tokens';
import type { Capabilities } from '@pi-agents/contracts';
import { useRootStore } from '@/providers/RootStoreProvider';

type Phase =
  | 'idle'
  | 'checking'
  | 'connected'
  | 'invalidUrl'
  | 'serverUnreachable'
  | 'authRequired'
  | 'unsupportedVersion';

type Diagnostics = {
  latencyMs: number;
  apiVersion: string;
  capabilities: Capabilities;
};

const CAPABILITY_ROWS: ReadonlyArray<{ key: keyof Capabilities; label: string }> = [
  { key: 'authRequired', label: 'Bearer auth' },
  { key: 'piAvailable', label: 'Pi runtime' },
  { key: 'gitAvailable', label: 'Git' },
  { key: 'supportsWorktrees', label: 'Worktrees' },
  { key: 'supportsSse', label: 'SSE' },
  { key: 'supportsWebSocket', label: 'WebSocket' },
  { key: 'supportsVscodeWeb', label: 'VSCode Web' },
  { key: 'supportsIgnis', label: 'Ignis' },
];

function isValidBackendUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const hostPattern = /^(?:(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+)|localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?(?:\/.*)?$/i;
  const afterProtocol = trimmed.replace(/^https?:\/\//i, '');
  return hostPattern.test(afterProtocol);
}

export default observer(function SetupScreen() {
  const store = useRootStore();
  const { backend } = store;
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTestConnection = async () => {
    const trimmed = url.trim();
    setError(null);
    setDiagnostics(null);
    if (!isValidBackendUrl(trimmed)) {
      setPhase('invalidUrl');
      return;
    }
    setPhase('checking');
    const connection = await backend.connect(trimmed, token);
    if (connection?.status === 'connected' && connection.capabilities) {
      setDiagnostics({
        latencyMs: connection.latencyMs ?? 0,
        apiVersion: connection.capabilities.apiVersion,
        capabilities: connection.capabilities,
        });
      setPhase('connected');
    } else {
      setPhase(connection?.status === 'auth_required' ? 'authRequired' : 'serverUnreachable');
      setError(connection?.error ?? 'Не удалось подключиться к backend');
    }
  };

  const handleContinue = async (): Promise<void> => {
    if (!backend.baseUrl) {
      setPhase('serverUnreachable');
      setError('Backend URL is not configured');
      return;
    }
    router.replace('/projects');
  };

  const handleReset = async (): Promise<void> => {
    await store.reset();
    setUrl('');
    setToken('');
    setDiagnostics(null);
    setError(null);
    setPhase('idle');
  };

  const hasError = phase === 'invalidUrl' || phase === 'serverUnreachable' || phase === 'authRequired';
  const inputBorder = hasError ? tokens.color.danger : tokens.color.border;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: tokens.spacing.xl }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontSize: 28, fontWeight: '700', color: tokens.color.text }}>
        Pi Agents
      </Text>
      <Text style={{ marginTop: tokens.spacing.sm, color: tokens.color.textMuted }}>
        Подключение к backend на VPS
      </Text>

      <TextInput
        testID="setup.backendUrl"
        accessibilityLabel="Backend URL"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder="https://pi.example.internal"
        placeholderTextColor={tokens.color.textMuted}
        editable={phase !== 'checking'}
        style={{
          marginTop: tokens.spacing.xl,
          borderWidth: 1,
          borderColor: inputBorder,
          backgroundColor: tokens.color.surface,
          borderRadius: tokens.radius.md,
          padding: 14,
          color: tokens.color.text,
        }}
      />

      <TextInput
        testID="setup.serverToken"
        accessibilityLabel="Токен backend"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        placeholder="Bearer-токен (если сервер защищён)"
        placeholderTextColor={tokens.color.textMuted}
        editable={phase !== 'checking'}
        style={{
          marginTop: tokens.spacing.md,
          borderWidth: 1,
          borderColor: tokens.color.border,
          backgroundColor: tokens.color.surface,
          borderRadius: tokens.radius.md,
          padding: 14,
          color: tokens.color.text,
        }}
      />

      <Pressable
        testID="setup.testConnection"
        accessibilityLabel="Проверить подключение"
        accessibilityRole="button"
        onPress={handleTestConnection}
        disabled={phase === 'checking'}
        style={{
          marginTop: tokens.spacing.md,
          padding: 14,
          borderRadius: tokens.radius.md,
          backgroundColor: tokens.color.surfaceMuted,
          opacity: phase === 'checking' ? 0.6 : 1,
        }}
      >
        <Text style={{ textAlign: 'center', color: tokens.color.text }}>
          {phase === 'checking' ? 'Проверка…' : 'Проверить подключение'}
        </Text>
      </Pressable>

      {phase === 'invalidUrl' ? (
        <Text
          testID="setup.invalidUrlError"
          style={{ marginTop: tokens.spacing.md, color: tokens.color.danger }}
        >
          Некорректный URL. Укажите адрес вида http(s)://host[:port]
        </Text>
      ) : null}

      {phase === 'serverUnreachable' ? (
        <Text
          testID="setup.serverUnreachableError"
          style={{ marginTop: tokens.spacing.md, color: tokens.color.danger }}
        >
          {`Не удалось подключиться к backend${error ? `: ${error}` : ''}`}
        </Text>
      ) : null}

      {phase === 'authRequired' ? (
        <Text testID="setup.authRequired" style={{ marginTop: tokens.spacing.md, color: tokens.color.danger }}>
          Сервер доступен, но требует bearer-токен. Проверьте токен и повторите попытку.
        </Text>
      ) : null}

      {phase === 'connected' && diagnostics ? (
        <View
          testID="setup.diagnostics"
          style={{
            marginTop: tokens.spacing.lg,
            padding: tokens.spacing.lg,
            borderRadius: tokens.radius.lg,
            backgroundColor: tokens.color.successBg,
          }}
        >
          <Text style={{ fontWeight: '700', color: tokens.color.successText }}>
            Backend доступен
          </Text>
          <Text style={{ marginTop: tokens.spacing.sm, color: tokens.color.text }}>
            {`Версия API: ${diagnostics.apiVersion}`}
          </Text>
          <Text style={{ color: tokens.color.text }}>
            {`Задержка: ${diagnostics.latencyMs} мс`}
          </Text>
          <Text
            style={{
              marginTop: tokens.spacing.md,
              marginBottom: tokens.spacing.xs,
              color: tokens.color.textMuted,
            }}
          >
            Возможности сервера:
          </Text>
          {CAPABILITY_ROWS.map((row) => {
            const enabled = Boolean(diagnostics.capabilities[row.key]);
            return (
              <Text key={row.key} style={{ color: tokens.color.text }}>
                {`${enabled ? '✓' : '✗'} ${row.label}`}
              </Text>
            );
          })}
        </View>
      ) : null}

      <Pressable
        testID="setup.continue"
        accessibilityLabel="Сохранить и продолжить"
        accessibilityRole="button"
        onPress={handleContinue}
        disabled={phase !== 'connected'}
        style={{
          marginTop: tokens.spacing.xl,
          padding: 16,
          borderRadius: tokens.radius.lg,
          backgroundColor:
            phase === 'connected' ? tokens.color.primary : tokens.color.border,
        }}
      >
        <Text style={{ textAlign: 'center', color: '#fff', fontWeight: '700' }}>
          Сохранить и продолжить
        </Text>
      </Pressable>

      <Pressable
        accessibilityLabel="Сбросить сохранённое подключение"
        accessibilityRole="button"
        onPress={handleReset}
        style={{ marginTop: tokens.spacing.md, padding: tokens.spacing.md }}
      >
        <Text style={{ textAlign: 'center', color: tokens.color.textMuted }}>
          Сбросить сохранённое подключение
        </Text>
      </Pressable>
    </ScrollView>
  );
});
