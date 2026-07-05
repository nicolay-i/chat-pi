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
import type { McpServer } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';
import { REDACTED, hasSecretKey } from '@/features/trace/redaction';

type Status = 'loading' | 'loaded' | 'error';
type Transport = 'stdio' | 'sse' | 'ws';
const TRANSPORTS: Transport[] = ['stdio', 'sse', 'ws'];

type TestState = Record<string, { ok: boolean; error?: string }>;

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function maskEnv(env: Record<string, string>): Array<[string, string]> {
  return Object.entries(env).map(([key, value]) => [key, hasSecretKey(key) ? REDACTED : value]);
}

function envToText(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export default function McpScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [tests, setTests] = useState<TestState>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl || !projectId) {
      setStatus('error');
      setError(!projectId ? 'Missing project id' : 'Backend URL is not configured');
      setServers([]);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getMcp(projectId)
      .then((rows) => {
        if (!active) return;
        setServers(rows);
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

  const handleSaved = (rows: McpServer[]): void => {
    setServers(rows);
    setEditing(null);
    setAddOpen(false);
  };

  const handleTest = async (serverId: string): Promise<void> => {
    if (!baseUrl || !projectId) return;
    setTestingId(serverId);
    const client = new ApiClient(baseUrl);
    try {
      const result = await client.testMcp(projectId, serverId);
      setTests((prev) => ({ ...prev, [serverId]: { ok: result.ok } }));
    } catch (err: unknown) {
      setTests((prev) => ({
        ...prev,
        [serverId]: { ok: false, error: err instanceof Error ? err.message : String(err) },
      }));
    } finally {
      setTestingId(null);
    }
  };

  if (status === 'loading') {
    return (
      <View testID="mcp.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading MCP servers…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="mcp.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load MCP servers</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable testID="mcp.retry" style={styles.retry} onPress={refetch}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      testID="mcp.list"
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>MCP servers</Text>
        <Pressable
          testID="mcp.add"
          style={styles.headerBtn}
          onPress={() => setAddOpen(true)}
        >
          <Text style={styles.headerBtnText}>+ Add</Text>
        </Pressable>
      </View>

      {servers.length === 0 ? (
        <View testID="mcp.empty" style={styles.center}>
          <Text style={styles.muted}>No MCP servers configured.</Text>
        </View>
      ) : null}

      {servers.map((server) => {
        const test = tests[server.id];
        return (
          <View key={server.id} testID={`mcp.item.${server.id}`} style={styles.row}>
            <View style={styles.rowHead}>
              <Text style={styles.rowName}>{server.id}</Text>
              <Text style={styles.badge}>{server.transport}</Text>
            </View>
            <Text style={styles.rowMeta} numberOfLines={2}>
              {server.command}
            </Text>

            {Object.keys(server.env).length > 0 ? (
              <View style={styles.envBox}>
                {maskEnv(server.env).map(([key, value]) => (
                  <Text key={key} style={styles.envLine}>
                    {key}={value}
                  </Text>
                ))}
              </View>
            ) : null}

            <Text style={styles.rowMeta}>
              modes: {server.enabledPerMode.length > 0 ? server.enabledPerMode.join(', ') : '—'}
            </Text>

            <View style={styles.actionRow}>
              <Pressable
                testID={`mcp.edit.${server.id}`}
                style={styles.outlineBtn}
                onPress={() => setEditing(server)}
              >
                <Text style={styles.outlineBtnText}>Edit</Text>
              </Pressable>
              <Pressable
                testID={`mcp.test.${server.id}`}
                style={[styles.headerBtn, testingId === server.id ? styles.btnBusy : null]}
                disabled={testingId === server.id}
                onPress={() => handleTest(server.id)}
              >
                {testingId === server.id ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.headerBtnText}>Test tools</Text>
                )}
              </Pressable>
            </View>

            {test ? (
              <View style={styles.testResult}>
                <Text style={{ color: test.ok ? tokens.color.successText : tokens.color.danger, fontWeight: '700' }}>
                  {test.ok ? 'Tools OK' : 'Test failed'}
                </Text>
                {test.error ? <Text style={styles.danger}>{test.error}</Text> : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {error ? <Text style={[styles.danger, { marginTop: 12 }]}>{error}</Text> : null}

      <Modal
        testID="mcp.editor"
        visible={addOpen || editing !== null}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setEditing(null);
          setAddOpen(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <McpForm
              baseUrl={baseUrl}
              projectId={projectId}
              initial={editing}
              onCancel={() => {
                setEditing(null);
                setAddOpen(false);
              }}
              onSaved={handleSaved}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function McpForm({
  baseUrl,
  projectId,
  initial,
  onCancel,
  onSaved,
}: {
  baseUrl: string | null;
  projectId: string;
  initial: McpServer | null;
  onCancel: () => void;
  onSaved: (rows: McpServer[]) => void;
}) {
  const [id, setId] = useState(initial?.id ?? '');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [transport, setTransport] = useState<Transport>(initial?.transport ?? 'stdio');
  const [envText, setEnvText] = useState(initial ? envToText(initial.env) : '');
  const [modes, setModes] = useState(initial?.enabledPerMode.join(', ') ?? '');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    if (!baseUrl) {
      setFormError('Backend URL is not configured');
      return;
    }
    const trimmedId = id.trim();
    const trimmedCommand = command.trim();
    if (!trimmedId || !trimmedCommand) {
      setFormError('Server id and command are required');
      return;
    }
    setFormError(null);
    setBusy(true);
    const client = new ApiClient(baseUrl);
    const payload: McpServer = {
      id: trimmedId,
      command: trimmedCommand,
      transport,
      env: parseEnv(envText),
      enabledPerMode: modes
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean),
    };
    try {
      const rows = await client.saveMcp(projectId, payload);
      onSaved(rows);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      <Text style={styles.modalTitle}>{initial ? 'Edit server' : 'Add server'}</Text>

      <Text style={styles.label}>Server id</Text>
      <TextInput
        testID="mcp.field.id"
        style={styles.input}
        value={id}
        onChangeText={setId}
        placeholder="filesystem"
        placeholderTextColor={tokens.color.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Command</Text>
      <TextInput
        testID="mcp.field.command"
        style={styles.input}
        value={command}
        onChangeText={setCommand}
        placeholder="npx -y @modelcontextprotocol/server-filesystem ."
        placeholderTextColor={tokens.color.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={styles.label}>Transport</Text>
      <View style={styles.kindRow}>
        {TRANSPORTS.map((t) => (
          <Pressable
            key={t}
            testID={`mcp.transport.${t}`}
            onPress={() => setTransport(t)}
            style={[styles.kindPill, transport === t ? styles.kindPillActive : null]}
          >
            <Text style={{ color: transport === t ? '#FFFFFF' : tokens.color.textMuted, fontWeight: '700' }}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Env (KEY=VALUE per line)</Text>
      <TextInput
        testID="mcp.field.env"
        style={[styles.input, styles.textarea]}
        value={envText}
        onChangeText={setEnvText}
        placeholder={'API_KEY=sk-...\nNODE_ENV=production'}
        placeholderTextColor={tokens.color.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />

      <Text style={styles.label}>Enabled modes (comma-separated)</Text>
      <TextInput
        testID="mcp.field.modes"
        style={styles.input}
        value={modes}
        onChangeText={setModes}
        placeholder="discussion, implementation"
        placeholderTextColor={tokens.color.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {formError ? <Text style={styles.danger}>{formError}</Text> : null}

      <View style={styles.modalActions}>
        <Pressable testID="mcp.cancel" style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable testID="mcp.save" style={styles.saveBtn} onPress={handleSave} disabled={busy}>
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
  btnBusy: {
    opacity: 0.6,
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
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowName: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  badge: {
    color: tokens.color.primary,
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
  },
  rowMeta: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: 2,
  },
  envBox: {
    marginTop: 6,
    padding: 8,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surfaceMuted,
  },
  envLine: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.xs,
    fontFamily: 'monospace',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  outlineBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.surface,
  },
  outlineBtnText: {
    color: tokens.color.primary,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
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
    width: '88%',
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
  textarea: {
    minHeight: 72,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  kindPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  kindPillActive: {
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
