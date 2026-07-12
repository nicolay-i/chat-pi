import { useLocalSearchParams } from '@/navigation';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/theme/tokens';
import { RuntimePanel } from '@/features/trace/RuntimePanel';
import { TraceView } from '@/features/trace/TraceView';
import { useChatTrace } from '@/features/trace/useChatTrace';

export default function TraceScreen() {
  const { chatId } = useLocalSearchParams<{ chatId: string }>();
  const { data, status, error } = useChatTrace(chatId);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.background }} edges={['bottom']}>
      <View style={{ flex: 1, padding: tokens.spacing.lg }}>
        <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700', marginBottom: 8 }}>
          Full Trace
        </Text>
        {data && data.length > 0 ? <RuntimePanel events={data} /> : null}

        {status === 'loading' ? (
          <ActivityIndicator color={tokens.color.primary} style={{ marginTop: 24 }} />
        ) : status === 'error' ? (
          <View testID="trace.error">
            <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.md }}>{error}</Text>
          </View>
        ) : status === 'empty' ? (
          <View testID="trace.empty">
            <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md }}>
              События трассировки не найдены.
            </Text>
          </View>
        ) : (
          <TraceView events={data ?? []} />
        )}
      </View>
    </SafeAreaView>
  );
}
