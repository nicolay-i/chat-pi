import { useLocalSearchParams } from '@/navigation';
import { ChatScreen } from '@/features/chat/ChatScreen';

export default function ChatScreenRoute() {
  const { chatId, serverId } = useLocalSearchParams<{ chatId: string; serverId?: string }>();
  return <ChatScreen chatId={chatId} serverId={serverId} />;
}
