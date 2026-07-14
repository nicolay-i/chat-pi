import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from '@/navigation';
import type { CreateProjectInput, Project, ProjectRemoteSync } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/stores/useBackend';
import { ProjectForm } from '@/features/projects/ProjectForm';

type LoadStatus = 'loading' | 'loaded' | 'error';

export default function EditProjectScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  const { baseUrl } = useBackend();
  const [project, setProject] = useState<Project | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<ProjectRemoteSync | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);

  useEffect(() => {
    if (!baseUrl) return;
    let active = true;
    const client = new ApiClient(baseUrl);
    client
      .getProject(projectId)
      .then((p) => {
        if (!active) return;
        setProject(p);
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
  }, [baseUrl, projectId]);

  const handleSubmit = async (values: CreateProjectInput) => {
    if (!baseUrl) throw new Error('Backend URL is not configured');
    const client = new ApiClient(baseUrl);
    await client.updateProject(projectId, values);
    router.back();
  };

  const runSync = (mode: 'inspect' | 'apply'): void => {
    if (!baseUrl || syncBusy) return;
    setSyncBusy(true);
    setSyncError(null);
    void new ApiClient(baseUrl).syncProjectRemote(projectId, mode)
      .then((result) => {
        setSyncResult(result);
        setConfirmApply(false);
      })
      .catch((syncFailure: unknown) => setSyncError(syncFailure instanceof Error ? syncFailure.message : String(syncFailure)))
      .finally(() => setSyncBusy(false));
  };

  if (status === 'loading') {
    return (
      <View testID="edit.loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tokens.color.background }}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading project…</Text>
      </View>
    );
  }

  if (!baseUrl || status === 'error' || !project) {
    return (
      <View testID="edit.error" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tokens.color.background }}>
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load project</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{baseUrl ? error : 'Backend URL is not configured'}</Text>
        <Pressable
          testID="edit.back"
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={{ marginTop: 12, paddingVertical: 10, paddingHorizontal: 18, borderRadius: tokens.radius.md, backgroundColor: tokens.color.primary }}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text }}>Edit project</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>{project.name}</Text>
        <View testID="project.remoteSync" style={{ marginTop: 16, padding: 14, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border }}>
          <Text style={{ color: tokens.color.text, fontWeight: '700' }}>Remote sync</Text>
          <Text style={{ color: tokens.color.textMuted, marginTop: 4, fontSize: tokens.fontSize.sm }}>
            Проверка ничего не изменяет. Fast-forward применяется только отдельной подтверждённой командой.
          </Text>
          {syncResult ? (
            <View testID="project.remoteSync.result" style={{ marginTop: 10, gap: 3 }}>
              <Text style={{ color: tokens.color.text, fontWeight: '700' }}>{syncResult.status.replaceAll('_', ' ')}</Text>
              <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>Local: {syncResult.localSha.slice(0, 12)}</Text>
              <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>Remote: {syncResult.remoteSha.slice(0, 12)}</Text>
              <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>Stale Tasks: {syncResult.staleTaskIds.length}</Text>
            </View>
          ) : null}
          {syncError ? <Text testID="project.remoteSync.error" style={{ color: tokens.color.danger, marginTop: 8, fontSize: tokens.fontSize.sm }}>{syncError}</Text> : null}
          <View style={{ marginTop: 10, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Pressable
              testID="project.remoteSync.inspect"
              accessibilityRole="button"
              accessibilityLabel="Проверить remote"
              disabled={syncBusy}
              onPress={() => runSync('inspect')}
              style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: tokens.radius.md, borderWidth: 1, borderColor: tokens.color.primary, opacity: syncBusy ? 0.5 : 1 }}
            >
              <Text style={{ color: tokens.color.primary, fontWeight: '700' }}>{syncBusy ? 'Проверка…' : 'Проверить remote'}</Text>
            </Pressable>
            {syncResult?.status === 'fast_forward_available' ? (
              <Pressable
                testID="project.remoteSync.apply"
                accessibilityRole="button"
                accessibilityLabel="Применить fast-forward"
                disabled={syncBusy}
                onPress={() => setConfirmApply(true)}
                style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: tokens.radius.md, backgroundColor: tokens.color.primary, opacity: syncBusy ? 0.5 : 1 }}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Применить fast-forward</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
      <ProjectForm
        submitLabel="Save changes"
        initialValues={{
          name: project.name,
          repoPath: project.repoPath,
          defaultBranch: project.defaultBranch,
          agentsDir: project.agentsDir,
        }}
        onSubmit={handleSubmit}
      />
      <Modal
        testID="project.remoteSync.confirmDialog"
        visible={confirmApply}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!syncBusy) setConfirmApply(false); }}
      >
        <View style={{ flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <View style={{ width: '100%', maxWidth: 460, padding: 20, borderRadius: tokens.radius.lg, backgroundColor: tokens.color.surface }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>Применить fast-forward?</Text>
            <Text style={{ color: tokens.color.textMuted, marginTop: 8, fontSize: tokens.fontSize.sm }}>
              Основная ветка проекта будет обновлена до {syncResult?.remoteSha.slice(0, 12)}. Затронутые Task могут стать stale.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Pressable testID="project.remoteSync.cancel" accessibilityRole="button" accessibilityLabel="Отмена" disabled={syncBusy} onPress={() => setConfirmApply(false)} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
                <Text style={{ color: tokens.color.text }}>Отмена</Text>
              </Pressable>
              <Pressable testID="project.remoteSync.confirm" accessibilityRole="button" accessibilityLabel="Подтвердить fast-forward" disabled={syncBusy} onPress={() => runSync('apply')} style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: tokens.radius.md, backgroundColor: tokens.color.primary, opacity: syncBusy ? 0.5 : 1 }}>
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{syncBusy ? 'Применение…' : 'Подтвердить'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
