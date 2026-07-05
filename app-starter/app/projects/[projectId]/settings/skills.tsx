import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Skill } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';
import { mockSkills } from '@/features/skills/mockSkills';

type Status = 'loading' | 'loaded' | 'error';

export default function SkillsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [fallback, setFallback] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl || !projectId) {
      setStatus('error');
      setError(!projectId ? 'Missing project id' : 'Backend URL is not configured');
      setSkills([]);
      setFallback(false);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getSkills(projectId)
      .then((rows) => {
        if (!active) return;
        setSkills(rows);
        setFallback(false);
        setStatus('loaded');
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSkills(mockSkills);
        setFallback(true);
        setError(err instanceof Error ? err.message : String(err));
        setStatus('loaded');
      });
    return () => {
      active = false;
    };
  }, [baseUrl, projectId, nonce]);

  const handleToggle = (id: string, value: boolean): void => {
    setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: value } : s)));
  };

  const projectSkills = skills.filter((s) => s.source === 'project');
  const packageSkills = skills.filter((s) => s.source === 'package');
  const isEmpty = skills.length === 0;

  if (status === 'loading') {
    return (
      <View testID="skills.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading skills…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="skills.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load skills</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable testID="skills.retry" style={styles.retry} onPress={refetch}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView testID="skills.list" style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Skills</Text>
        <View style={styles.headerActions}>
          <Pressable
            testID="skills.create"
            style={styles.headerBtn}
            onPress={() => router.push(`./skills/new`)}
          >
            <Text style={styles.headerBtnText}>+ New</Text>
          </Pressable>
          <Pressable testID="skills.extract" style={[styles.headerBtn, { marginLeft: 8 }]}>
            <Text style={styles.headerBtnText}>Extract from chat</Text>
          </Pressable>
        </View>
      </View>

      {fallback ? (
        <Text style={styles.fallbackNote}>
          Showing local skills from `.agents/skills` (offline).
        </Text>
      ) : null}

      {isEmpty ? (
        <View testID="skills.empty" style={styles.center}>
          <Text style={styles.muted}>No skills yet.</Text>
        </View>
      ) : null}

      <SkillGroup
        label="Project"
        skills={projectSkills}
        onToggle={handleToggle}
        onOpen={(id) => router.push(`./skills/${encodeURIComponent(id)}`)}
      />
      <SkillGroup
        label="Package"
        skills={packageSkills}
        onToggle={handleToggle}
        onOpen={(id) => router.push(`./skills/${encodeURIComponent(id)}`)}
      />
    </ScrollView>
  );
}

function SkillGroup({
  label,
  skills,
  onToggle,
  onOpen,
}: {
  label: string;
  skills: Skill[];
  onToggle: (id: string, value: boolean) => void;
  onOpen: (id: string) => void;
}) {
  if (skills.length === 0) return null;
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      {skills.map((skill) => (
        <View key={skill.id} style={styles.row}>
          <Pressable
            testID={`skills.item.${skill.id}`}
            style={styles.rowMain}
            onPress={() => onOpen(skill.id)}
          >
            <Text style={styles.rowName}>{skill.name}</Text>
            {skill.description ? (
              <Text style={styles.rowDesc} numberOfLines={2}>
                {skill.description}
              </Text>
            ) : null}
            <Text style={styles.badge}>{skill.source}</Text>
          </Pressable>
          <Switch
            testID={`skills.toggle.${skill.id}`}
            value={skill.enabled}
            onValueChange={(v) => onToggle(skill.id, v)}
          />
        </View>
      ))}
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
    flexWrap: 'wrap',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
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
  fallbackNote: {
    marginTop: 12,
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    fontStyle: 'italic',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowMain: {
    flex: 1,
    marginRight: 12,
  },
  rowName: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.md,
    fontWeight: '700',
  },
  rowDesc: {
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
});
