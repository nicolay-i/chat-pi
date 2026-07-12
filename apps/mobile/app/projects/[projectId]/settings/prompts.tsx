import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from '@/navigation';
import type { PromptTemplate } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/stores/useBackend';

type Status = 'loading' | 'loaded' | 'empty' | 'error';

const MODE_ORDER = ['discussion', 'planning', 'implementation', 'orchestration'] as const;

function groupsFor(prompts: PromptTemplate[]): { mode: string; items: PromptTemplate[] }[] {
  const byMode = new Map<string, PromptTemplate[]>();
  for (const p of prompts) {
    const key = p.mode ?? 'general';
    const list = byMode.get(key);
    if (list) list.push(p);
    else byMode.set(key, [p]);
  }
  const ordered: { mode: string; items: PromptTemplate[] }[] = [];
  for (const m of MODE_ORDER) {
    const items = byMode.get(m);
    if (items) ordered.push({ mode: m, items });
  }
  const general = byMode.get('general');
  if (general) ordered.push({ mode: 'general', items: general });
  for (const [key, items] of byMode.entries()) {
    if (MODE_ORDER.includes(key as (typeof MODE_ORDER)[number]) || key === 'general') continue;
    ordered.push({ mode: key, items });
  }
  return ordered;
}

export default function PromptsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl || !projectId) {
      setStatus('error');
      setError(!projectId ? 'Missing project id' : 'Backend URL is not configured');
      setPrompts([]);
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
        setPrompts(rows);
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

  if (status === 'loading') {
    return (
      <View testID="prompts.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading prompts…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="prompts.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load prompts</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          testID="prompts.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading prompts"
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
      <View testID="prompts.empty" style={styles.center}>
        <Text style={styles.muted}>No prompt templates yet.</Text>
      </View>
    );
  }

  const groups = groupsFor(prompts);

  return (
    <ScrollView testID="prompts.list" style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>Prompt Templates</Text>
      {groups.map((group) => (
        <View key={group.mode} style={styles.group}>
          <Text style={styles.groupLabel}>{group.mode}</Text>
          {group.items.map((p) => (
            <Pressable
              key={p.id}
              testID={`prompts.item.${p.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Open prompt ${p.name}`}
              style={styles.row}
              onPress={() => router.push(`./prompts/${encodeURIComponent(p.id)}`)}
            >
              <Text style={styles.rowName}>{p.name}</Text>
              <View style={styles.rowMeta}>
                {p.mode ? (
                  <Text style={styles.modeBadge}>{p.mode}</Text>
                ) : null}
                <Text style={styles.varCount}>{p.variables.length} vars</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ))}
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
  group: {
    marginTop: 16,
  },
  groupLabel: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: tokens.color.textMuted,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  row: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowName: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  modeBadge: {
    color: tokens.color.primary,
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
    marginRight: 8,
  },
  varCount: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.xs,
  },
});
