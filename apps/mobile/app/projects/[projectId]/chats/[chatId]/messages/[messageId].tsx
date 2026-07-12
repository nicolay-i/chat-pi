import { TraceEventDetail } from '@/features/trace/TraceEventDetail';
import { useLocalSearchParams } from '@/navigation';

export default function Screen() {
  const { chatId, messageId } = useLocalSearchParams<{ chatId: string; messageId: string }>();
  return <TraceEventDetail chatId={chatId} targetId={messageId} kind="message" />;
}
