import { FlatList, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { tokens } from '@/theme/tokens';
import { mockChats } from '@/mocks/mockData';

export default function ChatsScreen() {
  const { projectId } = useLocalSearchParams<{ projectId: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text }}>Chats</Text>
      <FlatList
        data={mockChats}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/projects/${projectId}/chats/${item.id}`)} style={{ backgroundColor: tokens.color.surface, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <Text style={{ color: tokens.color.text, fontWeight: '700' }}>{item.title}</Text>
            <Text style={{ color: tokens.color.textMuted }}>{item.lastMessagePreview}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
