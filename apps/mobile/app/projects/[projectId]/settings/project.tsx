import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from '@/navigation';
import type { CreateProjectInput, Project } from '@pi-agents/contracts';
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

  useEffect(() => {
    if (!baseUrl) {
      setStatus('error');
      setError('Backend URL is not configured');
      return;
    }
    let active = true;
    const client = new ApiClient(baseUrl);
    setStatus('loading');
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

  if (status === 'loading') {
    return (
      <View testID="edit.loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tokens.color.background }}>
        <ActivityIndicator color={tokens.color.primary} />
        <Text style={{ color: tokens.color.textMuted, marginTop: 8 }}>Loading project…</Text>
      </View>
    );
  }

  if (status === 'error' || !project) {
    return (
      <View testID="edit.error" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: tokens.color.background }}>
        <Text style={{ color: tokens.color.danger, fontWeight: '700' }}>Failed to load project</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4, textAlign: 'center' }}>{error}</Text>
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
    </View>
  );
}
