import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { Skill } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';
import { parseInline, parseMarkdown, type MarkdownBlock } from '@/features/files/fileTree';
import { findMockSkill, mockSkillBodies } from '@/features/skills/mockSkills';

type Status = 'loading' | 'loaded' | 'error';

export default function SkillEditorScreen() {
  const { projectId, skillId } = useLocalSearchParams<{ projectId: string; skillId: string }>();
  const { baseUrl } = useBackend();
  const [skill, setSkill] = useState<Skill | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  // Seed from the known mock skills so the editor is responsive before fetch.
  useEffect(() => {
    const seed = findMockSkill(skillId);
    if (seed) {
      setName(seed.name);
      setDescription(seed.description ?? '');
      setEnabled(seed.enabled);
      setSkill(seed);
    }
    setBody(mockSkillBodies[skillId] ?? '');
    setStatus('loaded');
  }, [skillId]);

  useEffect(() => {
    if (!baseUrl || !projectId || !skillId) {
      if (!baseUrl) {
        setStatus('error');
        setError('Backend URL is not configured');
      }
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getSkill(projectId, skillId)
      .then((row) => {
        if (!active) return;
        setSkill(row);
        setName(row.name);
        setDescription(row.description ?? '');
        setEnabled(row.enabled);
        setStatus('loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        // keep mock seed if present; otherwise surface the error.
        if (!findMockSkill(skillId)) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        } else {
          setStatus('loaded');
        }
      });
    return () => {
      active = false;
    };
  }, [baseUrl, projectId, skillId, nonce]);

  const handleSave = (): void => {
    if (!baseUrl || !projectId || !skillId) return;
    setSaving(true);
    setToast(null);
    const client = new ApiClient(baseUrl);
    client
      .saveSkill(projectId, skillId, {
        name,
        description: description.length > 0 ? description : undefined,
        enabled,
        source: skill?.source ?? 'project',
        path: skill?.path ?? `.agents/skills/${skillId}/SKILL.md`,
      })
      .then(() => setToast('Saved'))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setToast(`Save failed: ${msg}`);
      })
      .finally(() => setSaving(false));
  };

  const handleTest = (): void => {
    if (!baseUrl || !projectId || !skillId) return;
    setTesting(true);
    setToast(null);
    const client = new ApiClient(baseUrl);
    client
      .testSkill(projectId, skillId)
      .then((res) => setToast(res.ok ? 'Test: OK' : 'Test: failed'))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        setToast(`Test failed: ${msg}`);
      })
      .finally(() => setTesting(false));
  };

  if (status === 'loading') {
    return (
      <View testID="skillEditor.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading skill…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="skillEditor.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load skill</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          testID="skillEditor.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading skill"
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
      testID="skillEditor.screen"
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
    >
      <Text style={styles.label}>Name</Text>
      <TextInput
        testID="skillEditor.name"
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Skill name"
        placeholderTextColor={tokens.color.textMuted}
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        testID="skillEditor.description"
        style={[styles.input, { minHeight: 44 }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Short description"
        placeholderTextColor={tokens.color.textMuted}
        multiline
      />

      <View style={styles.toggleRow}>
        <Text style={styles.labelInline}>Enabled</Text>
        <Switch testID="skillEditor.enabled" value={enabled} onValueChange={setEnabled} />
      </View>

      <Text style={styles.label}>SKILL.md body</Text>
      <TextInput
        testID="skillEditor.body"
        style={[styles.input, styles.body]}
        value={body}
        onChangeText={setBody}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        textAlignVertical="top"
      />

      <Text style={styles.label}>Preview</Text>
      <View testID="skillEditor.preview" style={styles.preview}>
        <MarkdownPreview blocks={parseMarkdown(body)} />
      </View>

      <View style={styles.actions}>
        <Pressable
          testID="skillEditor.test"
          accessibilityRole="button"
          accessibilityLabel="Test skill"
          style={[styles.actionBtn, { marginRight: 8, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.primary }]}
          onPress={handleTest}
          disabled={testing}
        >
          <Text style={[styles.actionBtnText, { color: tokens.color.primary }]}>
            {testing ? 'Testing…' : 'Test skill'}
          </Text>
        </Pressable>
        <Pressable
          testID="skillEditor.save"
          accessibilityRole="button"
          accessibilityLabel="Save skill"
          style={[styles.actionBtn, { backgroundColor: tokens.color.primary, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>
      </View>

      {toast ? <Text style={styles.toast}>{toast}</Text> : null}
    </ScrollView>
  );
}

function MarkdownPreview({ blocks }: { blocks: MarkdownBlock[] }) {
  return (
    <View>
      {blocks.length === 0 ? <Text style={styles.muted}>(empty)</Text> : null}
      {blocks.map((b, i) => {
        const spans = parseInline(b.text);
        if (b.kind === 'h1') {
          return (
            <Text key={i} style={styles.h1}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === 'h2') {
          return (
            <Text key={i} style={styles.h2}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === 'h3') {
          return (
            <Text key={i} style={styles.h3}>
              {b.text}
            </Text>
          );
        }
        if (b.kind === 'bullet') {
          return (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.paragraph}>
                {spans.map((s, j) =>
                  s.kind === 'code' ? (
                    <Text key={j} style={styles.inlineCode}>
                      {s.text}
                    </Text>
                  ) : (
                    <Text key={j}>{s.text}</Text>
                  ),
                )}
              </Text>
            </View>
          );
        }
        if (b.kind === 'code') {
          return (
            <Text key={i} style={styles.codeBlock}>
              {b.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={styles.paragraph}>
            {spans.map((s, j) =>
              s.kind === 'code' ? (
                <Text key={j} style={styles.inlineCode}>
                  {s.text}
                </Text>
              ) : (
                <Text key={j}>{s.text}</Text>
              ),
            )}
          </Text>
        );
      })}
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
  label: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
    marginTop: 12,
    marginBottom: 4,
  },
  labelInline: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
    marginRight: 12,
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
    minHeight: 160,
    textAlignVertical: 'top',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  preview: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 12,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    color: tokens.color.text,
    marginTop: 8,
    marginBottom: 4,
  },
  h2: {
    fontSize: 18,
    fontWeight: '700',
    color: tokens.color.text,
    marginTop: 8,
    marginBottom: 4,
  },
  h3: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.text,
    marginTop: 6,
    marginBottom: 2,
  },
  paragraph: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bullet: {
    color: tokens.color.textMuted,
    marginRight: 8,
    fontSize: tokens.fontSize.md,
  },
  inlineCode: {
    fontFamily: 'monospace',
    backgroundColor: tokens.color.codeBg,
    color: tokens.color.successText,
    fontSize: tokens.fontSize.sm,
  },
  codeBlock: {
    fontFamily: 'monospace',
    backgroundColor: tokens.color.surfaceMuted,
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    padding: 8,
    borderRadius: tokens.radius.sm,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 20,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
  },
  actionBtnText: {
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
