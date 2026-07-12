import { useLocalSearchParams } from '@/navigation';
import { ChatScreen } from '@/features/chat/ChatScreen';

export default function ChatScreenRoute() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  return <ChatScreen chatId={chatId} />;
}
