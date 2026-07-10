import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatThread } from '@/features/chat/ChatThread';

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <ChatThread chatId={chatId} />
    </SafeAreaView>
  );
}
