import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { ApiClient } from '@/api/client';
import type { Capabilities } from '@pi-agents/contracts';
import { backendActions, persistBaseUrl } from '@/state/backendStore';
import { clearBackendUrl, saveBackendUrl } from '@/state/backendStorage';

type Phase =
  | 'idle'
  | 'checking'
  | 'connected'
  | 'invalidUrl'
  | 'serverUnreachable'
  | 'unsupportedVersion';

type Diagnostics = {
  latencyMs: number;
  apiVersion: string;
  capabilities: Capabilities;
};

const CAPABILITY_ROWS: ReadonlyArray<{ key: keyof Capabilities; label: string }> = [
  { key: 'piAvailable', label: 'Pi runtime' },
  { key: 'gitAvailable', label: 'Git' },
  { key: 'supportsWorktrees', label: 'Worktrees' },
  { key: 'supportsSse', label: 'SSE' },
  { key: 'supportsWebSocket', label: 'WebSocket' },
  { key: 'supportsPackageInstall', label: 'Package install' },
  { key: 'supportsVscodeWeb', label: 'VSCode Web' },
  { key: 'supportsIgnis', label: 'Ignis' },
];

function isValidBackendUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  const hostPattern = /^(?:[a-z0-9-]+(?:\.[a-z0-9-]+)+|localhost)(?::\d+)?(?:\/.*)?$/i;
  const afterProtocol = trimmed.replace(/^https?:\/\//i, '');
  return hostPattern.test(afterProtocol);
}

export default function SetupScreen() {
  const [url, setUrl] = useState('');
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
    try {
      const client = new ApiClient(trimmed);
      const t0 = Date.now();
      await client.getHealth();
      const latencyMs = Date.now() - t0;
      const capabilities = await client.getCapabilities();
      setDiagnostics({ latencyMs, apiVersion: capabilities.apiVersion, capabilities });
      setPhase('connected');
      backendActions.setBaseUrl(trimmed);
      backendActions.setCapabilities(capabilities);
      backendActions.setStatus('connected');
      void saveBackendUrl(trimmed);
    } catch (e) {
      setPhase('serverUnreachable');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleContinue = () => {
    const trimmed = url.trim();
    void persistBaseUrl(trimmed);
    router.replace('/projects');
  };

  const handleReset = () => {
    void clearBackendUrl();
    backendActions.setBaseUrl(null);
    backendActions.setCapabilities(null);
    backendActions.setStatus('idle');
    setUrl('');
    setDiagnostics(null);
    setError(null);
    setPhase('idle');
  };

  const hasError = phase === 'invalidUrl' || phase === 'serverUnreachable';
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
}
