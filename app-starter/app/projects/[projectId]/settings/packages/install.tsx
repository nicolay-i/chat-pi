import { useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import type { PackageInstallResult, PackageManifest } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';

type SourceKind = 'npm' | 'git' | 'local';
const SOURCE_KINDS: { kind: SourceKind; label: string; placeholder: string }[] = [
  { kind: 'npm', label: 'npm package', placeholder: '@scope/pi-plugin-fancy' },
  { kind: 'git', label: 'git URL', placeholder: 'https://github.com/org/repo.git' },
  { kind: 'local', label: 'local path', placeholder: './packages/my-plugin' },
];

type ResolveState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'resolved'; result: PackageInstallResult }
  | { phase: 'error'; message: string };

const EMPTY_RESOURCES: PackageManifest['resources'] = {
  extensions: [],
  skills: [],
  prompts: [],
  themes: [],
  providers: [],
};

export default function PackageInstallScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();

  const [sourceKind, setSourceKind] = useState<SourceKind>('npm');
  const [sourceInput, setSourceInput] = useState('');
  const [state, setState] = useState<ResolveState>({ phase: 'idle' });
  const [trust, setTrust] = useState(false);
  const [installing, setInstalling] = useState(false);

  const placeholder = SOURCE_KINDS.find((s) => s.kind === sourceKind)!.placeholder;

  const handleResolve = async (): Promise<void> => {
    if (!baseUrl || !projectId) {
      setState({ phase: 'error', message: 'Backend URL is not configured' });
      return;
    }
    const name = sourceInput.trim();
    if (!name) {
      setState({ phase: 'error', message: 'Enter a package source' });
      return;
    }
    setState({ phase: 'loading' });
    setTrust(false);
    const client = new ApiClient(baseUrl);
    try {
      const result = await client.resolvePackage(projectId, { name });
      setState({ phase: 'resolved', result });
    } catch (err: unknown) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleInstall = async (): Promise<void> => {
    if (!baseUrl || !projectId || !trust) return;
    const name = sourceInput.trim();
    if (!name) return;
    setInstalling(true);
    const client = new ApiClient(baseUrl);
    try {
      await client.installPackage(projectId, { name });
      router.back();
    } catch (err: unknown) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setInstalling(false);
    }
  };

  const resolved = state.phase === 'resolved' ? state.result.manifest ?? null : null;
  const resources = resolved?.resources ?? EMPTY_RESOURCES;
  const canInstall = state.phase === 'resolved' && trust && !installing;

  return (
    <ScrollView
      testID="packages.install.screen"
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <Text style={styles.title}>Install package</Text>

      <Text style={styles.label}>Source</Text>
      <View testID="packages.install.source" style={styles.kindRow}>
        {SOURCE_KINDS.map((s) => (
          <Pressable
            key={s.kind}
            testID={`packages.install.kind.${s.kind}`}
            accessibilityRole="button"
            accessibilityLabel={`Source ${s.label}`}
            onPress={() => setSourceKind(s.kind)}
            style={[styles.kindPill, sourceKind === s.kind ? styles.kindPillActive : null]}
          >
            <Text style={{ color: sourceKind === s.kind ? '#FFFFFF' : tokens.color.textMuted, fontWeight: '700' }}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Package source</Text>
      <TextInput
        testID="packages.install.sourceInput"
        accessibilityLabel="Package source"
        style={styles.input}
        value={sourceInput}
        onChangeText={setSourceInput}
        placeholder={placeholder}
        placeholderTextColor={tokens.color.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        testID="packages.install.resolve"
        accessibilityRole="button"
        accessibilityLabel="Resolve package"
        style={[styles.outlineBtn, state.phase === 'loading' ? styles.btnBusy : null]}
        disabled={state.phase === 'loading'}
        onPress={handleResolve}
      >
        {state.phase === 'loading' ? (
          <ActivityIndicator color={tokens.color.primary} />
        ) : (
          <Text style={styles.outlineBtnText}>Resolve</Text>
        )}
      </Pressable>

      {state.phase === 'error' ? <Text style={styles.danger}>{state.message}</Text> : null}

      {resolved ? (
        <View testID="packages.install.resources" style={styles.resourcesCard}>
          <View style={styles.resourceHead}>
            <Text style={styles.resourceName}>{resolved.name}</Text>
            <Text style={styles.resourceVersion}>v{resolved.version}</Text>
          </View>
          {resolved.description ? (
            <Text style={styles.resourceDesc}>{resolved.description}</Text>
          ) : null}

          <ResourceSection label="Extensions" items={resources.extensions} />
          <ResourceSection label="Skills" items={resources.skills} />
          <ResourceSection label="Prompts" items={resources.prompts} />
          <ResourceSection label="Themes" items={resources.themes} />
          <ResourceSection label="Providers" items={resources.providers} />

          <View style={styles.trustRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.trustTitle}>Trust this package</Text>
              <Text style={styles.trustHint}>
                Extensions will not load until the package is trusted.
              </Text>
            </View>
            <Switch
              testID="packages.install.trust"
              accessibilityLabel="Trust package before install"
              value={trust}
              onValueChange={setTrust}
            />
          </View>
        </View>
      ) : null}

      <Pressable
        testID="packages.install.install"
        accessibilityRole="button"
        accessibilityLabel="Install package"
        style={[styles.saveBtn, canInstall ? null : styles.btnDisabled]}
        disabled={!canInstall}
        onPress={handleInstall}
      >
        {installing ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveText}>Install</Text>
        )}
      </Pressable>

      {!trust && state.phase === 'resolved' ? (
        <Text style={styles.hint}>Toggle trust to enable install.</Text>
      ) : null}
    </ScrollView>
  );
}

function ResourceSection({ label, items }: { label: string; items: string[] }) {
  return (
    <View style={styles.resourceSection}>
      <Text style={styles.resourceSectionLabel}>
        {label} ({items.length})
      </Text>
      {items.length === 0 ? (
        <Text style={styles.resourceEmpty}>—</Text>
      ) : (
        items.map((item) => (
          <Text key={item} style={styles.resourceItem}>
            {item}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.background,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.text,
  },
  label: {
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
    color: tokens.color.textMuted,
    marginTop: 12,
    marginBottom: 4,
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
  outlineBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
  },
  btnBusy: {
    opacity: 0.6,
  },
  outlineBtnText: {
    color: tokens.color.primary,
    fontWeight: '700',
  },
  danger: {
    color: tokens.color.danger,
    marginTop: 8,
    fontWeight: '700',
  },
  resourcesCard: {
    marginTop: 16,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 16,
  },
  resourceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  resourceName: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.lg,
    fontWeight: '700',
  },
  resourceVersion: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
  },
  resourceDesc: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: 4,
  },
  resourceSection: {
    marginTop: 12,
  },
  resourceSectionLabel: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
  },
  resourceEmpty: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
  },
  resourceItem: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    marginTop: 2,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    gap: 12,
  },
  trustTitle: {
    color: tokens.color.text,
    fontWeight: '700',
    fontSize: tokens.fontSize.md,
  },
  trustHint: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: 2,
  },
  saveBtn: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    backgroundColor: tokens.color.primary,
  },
  btnDisabled: {
    backgroundColor: tokens.color.surfaceMuted,
    opacity: 0.6,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  hint: {
    color: tokens.color.textMuted,
    marginTop: 8,
    textAlign: 'center',
    fontSize: tokens.fontSize.sm,
  },
});
