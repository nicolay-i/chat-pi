import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { PackageManifest } from '@pi-agents/contracts';
import { ApiClient } from '@/api/client';
import { tokens } from '@/theme/tokens';
import { useBackend } from '@/state/backendStore';

type Status = 'loading' | 'loaded' | 'error';

export default function PackagesScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [packages, setPackages] = useState<PackageManifest[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [pendingTrust, setPendingTrust] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<PackageManifest | null>(null);
  const [removing, setRemoving] = useState(false);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!baseUrl || !projectId) {
      setStatus('error');
      setError(!projectId ? 'Missing project id' : 'Backend URL is not configured');
      setPackages([]);
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
    setError(null);
    client
      .getPackages(projectId)
      .then((rows) => {
        if (!active) return;
        setPackages(rows);
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

  const handleTrust = async (pkg: PackageManifest, next: boolean): Promise<void> => {
    if (!baseUrl || !projectId) return;
    setPackages((prev) => prev.map((p) => (p.name === pkg.name ? { ...p, trusted: next } : p)));
    if (!next) {
      return;
    }
    setPendingTrust(pkg.name);
    const client = new ApiClient(baseUrl);
    try {
      const result = await client.trustPackage(projectId, pkg.name);
      if (result.manifest) {
        setPackages((prev) => prev.map((p) => (p.name === pkg.name ? result.manifest! : p)));
      }
    } catch (err: unknown) {
      setPackages((prev) => prev.map((p) => (p.name === pkg.name ? { ...p, trusted: pkg.trusted } : p)));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingTrust(null);
    }
  };

  const handleConfirmRemove = async (): Promise<void> => {
    if (!baseUrl || !projectId || !removeTarget) return;
    setRemoving(true);
    const client = new ApiClient(baseUrl);
    try {
      await client.removePackage(projectId, removeTarget.name);
      setPackages((prev) => prev.filter((p) => p.name !== removeTarget.name));
      setRemoveTarget(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  };

  if (status === 'loading') {
    return (
      <View testID="packages.loading" style={styles.center}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={styles.muted}>Loading packages…</Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View testID="packages.error" style={styles.center}>
        <Text style={styles.danger}>Failed to load packages</Text>
        <Text style={styles.muted}>{error}</Text>
        <Pressable
          testID="packages.retry"
          accessibilityRole="button"
          accessibilityLabel="Retry loading packages"
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
      testID="packages.list"
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 24 }}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Packages</Text>
        <Pressable
          testID="packages.install"
          accessibilityRole="button"
          accessibilityLabel="Install package"
          style={styles.headerBtn}
          onPress={() => router.push(`./packages/install`)}
        >
          <Text style={styles.headerBtnText}>+ Install</Text>
        </Pressable>
      </View>

      {packages.length === 0 ? (
        <View testID="packages.empty" style={styles.center}>
          <Text style={styles.muted}>No packages installed.</Text>
        </View>
      ) : null}

      {packages.map((pkg) => {
        const disabled = !pkg.trusted;
        return (
          <View
            key={pkg.name}
            testID={`packages.item.${pkg.name}`}
            style={[styles.row, disabled ? styles.rowDisabled : null]}
          >
            <View style={styles.rowHead}>
              <Text style={styles.rowName}>{pkg.name}</Text>
              <Text style={styles.version}>v{pkg.version}</Text>
            </View>

            {pkg.description ? (
              <Text style={styles.rowDesc} numberOfLines={2}>
                {pkg.description}
              </Text>
            ) : null}

            <View style={styles.tagRow}>
              <Text style={pkg.trusted ? styles.tagTrusted : styles.tagUntrusted}>
                {pkg.trusted ? 'trusted' : 'untrusted'}
              </Text>
              {disabled ? (
                <Text style={styles.disabledNote}>расширения отключены</Text>
              ) : null}
            </View>

            <View style={styles.actionRow}>
              <View style={styles.trustCell}>
                <Text style={styles.trustLabel}>Trust</Text>
                <Switch
                  testID={`packages.trust.${pkg.name}`}
                  accessibilityLabel={`Trust ${pkg.name}`}
                  value={pkg.trusted}
                  disabled={pendingTrust === pkg.name}
                  onValueChange={(v) => handleTrust(pkg, v)}
                />
              </View>
              <Pressable
                testID={`packages.remove.${pkg.name}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${pkg.name}`}
                style={styles.removeBtn}
                onPress={() => setRemoveTarget(pkg)}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      {error ? <Text style={[styles.danger, { marginTop: 12 }]}>{error}</Text> : null}

      <Modal
        testID="packages.removeConfirm"
        visible={removeTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => (removing ? null : setRemoveTarget(null))}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Remove package?</Text>
            <Text style={styles.muted}>
              {removeTarget?.name} v{removeTarget?.version} will be removed from this project.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                testID="packages.removeConfirm.cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setRemoveTarget(null)}
                disabled={removing}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                testID="packages.removeConfirm.confirm"
                accessibilityRole="button"
                accessibilityLabel="Remove package"
                onPress={handleConfirmRemove}
                disabled={removing}
                style={styles.dangerBtn}
              >
                {removing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Remove</Text>}
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
  rowDisabled: {
    opacity: 0.6,
    backgroundColor: tokens.color.surfaceMuted,
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
  version: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
  },
  rowDesc: {
    color: tokens.color.textMuted,
    fontSize: tokens.fontSize.sm,
    marginTop: 2,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 8,
  },
  tagTrusted: {
    color: tokens.color.successText,
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
  },
  tagUntrusted: {
    color: tokens.color.danger,
    fontSize: tokens.fontSize.xs,
    fontWeight: '700',
  },
  disabledNote: {
    color: tokens.color.danger,
    fontSize: tokens.fontSize.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  trustCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trustLabel: {
    color: tokens.color.text,
    fontSize: tokens.fontSize.sm,
    fontWeight: '700',
  },
  removeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.danger,
    backgroundColor: tokens.color.surface,
  },
  removeText: {
    color: tokens.color.danger,
    fontWeight: '700',
    fontSize: tokens.fontSize.sm,
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
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  cancelText: {
    color: tokens.color.textMuted,
    fontWeight: '700',
  },
  dangerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.danger,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
