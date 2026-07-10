import { useLocalSearchParams } from 'expo-router';
import { MvpChatScreen } from '@/features/chat/MvpChatScreen';

export default function ChatScreenRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <MvpChatScreen chatId={chatId} />;
}
