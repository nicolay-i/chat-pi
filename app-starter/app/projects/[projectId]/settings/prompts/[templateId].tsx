import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { PromptTemplate, RunMode } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';

const MODE_OPTIONS: RunMode[] = ['discussion', 'planning', 'implementation', 'orchestration'];

type Status = 'loading' | 'loaded' | 'error';

/**
 * Replaces `{var}` occurrences in `body` with `<var>` placeholder markers.
 */
export function renderPromptPreview(body: string, variables: string[]): string {
  let out = body;
  for (const v of variables) {
    const safe = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\{${safe}\\}`, 'g'), `<${v}>`);
  }
  return out;
}

export default function PromptEditorScreen() {
  const { projectId, templateId } = useLocalSearchParams<{ projectId: string; templateId: string }>();
  const { baseUrl } = useBackend();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<RunMode | null>(null);
  const [body, setBody] = useState('');
  const [variablesText, setVariablesText] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const variables = useMemo(
    () =>
      variablesText
        .split(',')
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    [variablesText],
  );

  const preview = useMemo(() => renderPromptPreview(body, variables), [body, variables]);

  useEffect(() => {
    if (!baseUrl || !projectId || !templateId) {
      setStatus('error');
      setError(!templateId ? 'Missing template id' : 'Backend URL is not configured');
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getPrompts(projectId)
      .then((rows) => {
        if (!active) return;
        const tpl = rows.find((r) => r.id === templateId) ?? null;
        if (!tpl) {
          setError('Template not found');
          setStatus('error');
          return;
        }
        applyTemplate(tpl);
        setStatus('loaded');
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
  }, [baseUrl, projectId, templateId, nonce]);

  function applyTemplate(tpl: PromptTemplate): void {
    setName(tpl.name);
    setMode(tpl.mode ?? null);
    setBody(tpl.body);
    setVariablesText(tpl.variables.join(', '));
  }

  const handleSave = (): void => {
    if (!baseUrl || !projectId || !templateId) return;
    setSaving(true);
    setToast(null);
    const payload: PromptTemplate = {
      id: templateId,
      name,
      body,
      variables,
      ...(mode ? { mode } : {}),
    };
    const client = new ApiClient(baseUrl);
    client
      .savePrompt(projectId, templateId, payload)
      .then(() => setToast('Saved'))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setToast(`Save failed: ${msg}`);
      })
      .finally(() => setSaving(false));
  };

  if (status === 'loading') {
    return (
      <View testID="promptEditor.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading template…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="promptEditor.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load template</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          testID="promptEditor.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading template"
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
      testID="promptEditor.screen"
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <Text style={styles.label}>Name</Text>
      <TextInput
        testID="promptEditor.name"
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Template name"
        placeholderTextColor={tokens.color.textMuted}
      />

      <Text style={styles.label}>Mode</Text>
      <View style={styles.modeRow}>
        {MODE_OPTIONS.map((m) => {
          const active = mode === m;
          return (
            <Pressable
              key={m}
              testID={`promptEditor.mode.${m}`}
              accessibilityRole="button"
              accessibilityLabel={`Mode ${m}`}
              onPress={() => setMode(active ? null : m)}
              style={[
                styles.modeChip,
                active
                  ? { backgroundColor: tokens.color.primary, borderColor: tokens.color.primary }
                  : { backgroundColor: tokens.color.surface, borderColor: tokens.color.border },
              ]}
            >
              <Text
                style={[
                  styles.modeChipText,
                  active ? { color: '#FFFFFF' } : { color: tokens.color.textMuted },
                ]}
              >
                {m}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Body</Text>
      <TextInput
        testID="promptEditor.body"
        style={[styles.input, styles.body]}
        value={body}
        onChangeText={setBody}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
        placeholder="Use {variable} placeholders…"
        placeholderTextColor={tokens.color.textMuted}
      />

      <Text style={styles.label}>Variables (comma-separated)</Text>
      <TextInput
        testID="promptEditor.variables"
        style={styles.input}
        value={variablesText}
        onChangeText={setVariablesText}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="project_name, task_id"
        placeholderTextColor={tokens.color.textMuted}
      />

      <Text style={styles.label}>Render preview</Text>
      <View testID="promptEditor.preview" style={styles.preview}>
        <Text style={styles.previewText}>{preview || '(empty)'}</Text>
      </View>

      <Pressable
        testID="promptEditor.save"
        accessibilityRole="button"
        accessibilityLabel="Save template"
        style={[styles.saveBtn, { opacity: saving ? 0.6 : 1 }]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}
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
  label: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
    marginTop: 12,
    marginBottom: 4,
  },
  input: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  body: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSize.sm,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  modeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  modeChipText: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  preview: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 12,
  },
  previewText: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
  },
  saveBtn: {
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: tokens.fontSize.md,
  },
  toast: {
    color: tokens.color.textMuted,
    marginTop: 12,
    fontSize: tokens.fontSize.sm,
    textAlign: 'center',
  },
});
