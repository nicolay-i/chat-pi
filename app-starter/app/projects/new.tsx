import { router } from 'expo-router';
import { Text, View } from 'react-native';
import type { CreateProjectInput } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';
import { ApiClient } from '@/api/client';
import { useBackend } from '@/state/backendStore';
import { ProjectForm } from '@/features/projects/ProjectForm';

export default function NewProjectScreen() {
  const { baseUrl } = useBackend();

  const handleSubmit = async (values: CreateProjectInput) => {
    if (!baseUrl) throw new Error('Backend URL is not configured');
    const client = new ApiClient(baseUrl);
    const created = await client.createProject(values);
    router.replace(`/projects/${created.id}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text }}>Create project</Text>
        <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>
          Configure repository and runtime defaults before saving.
        </Text>
      </View>
      <ProjectForm submitLabel="Create project" onSubmit={handleSubmit} />
    </View>
  );
}
