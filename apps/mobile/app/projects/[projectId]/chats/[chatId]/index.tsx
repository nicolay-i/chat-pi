import { useLocalSearchParams } from '@/navigation';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatScreen as ChatFeatureScreen } from '@/features/chat/ChatScreen';

export default function ChatScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <ChatFeatureScreen chatId={chatId} />
    </SafeAreaView>
  );
}
