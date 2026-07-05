import { FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { mockProjects } from '@/mocks/mockData';

export default function ProjectsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background, padding: 16 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: tokens.color.text, marginBottom: 16 }}>Projects</Text>
      <FlatList
        data={mockProjects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable accessibilityLabel={`Открыть проект ${item.name}`} onPress={() => router.push(`/projects/${item.id}`)} style={{ backgroundColor: tokens.color.surface, borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: tokens.color.text }}>{item.name}</Text>
            <Text style={{ marginTop: 4, color: tokens.color.textMuted }}>{item.repoPath}</Text>
            <Text style={{ marginTop: 8, color: tokens.color.primary }}>{item.activeTaskCount} active tasks</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
