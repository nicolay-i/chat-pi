import { Link, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export default function ProjectDashboardScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text }}>Project {projectId}</Text>
      <View style={{ gap: 12, marginTop: 24 }}>
        <Link href={`/projects/${projectId}/chats`} style={{ color: tokens.color.primary }}>Chats</Link>
        <Link href={`/projects/${projectId}/tasks`} style={{ color: tokens.color.primary }}>Tasks</Link>
        <Link href={`/projects/${projectId}/files`} style={{ color: tokens.color.primary }}>Files</Link>
        <Link href={`/projects/${projectId}/settings/providers`} style={{ color: tokens.color.primary }}>Settings</Link>
      </View>
    </View>
  );
}
