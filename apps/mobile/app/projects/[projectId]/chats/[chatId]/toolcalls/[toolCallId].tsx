import { TraceEventDetail } from '@/features/trace/TraceEventDetail';
import { useLocalSearchParams } from '@/navigation';

export default function Screen() {
  const { chatId, toolCallId } = useLocalSearchParams<{ chatId: string; toolCallId: string }>();
  return <TraceEventDetail chatId={chatId} targetId={toolCallId} kind="toolCall" />;
}
