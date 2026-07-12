import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import type { RealtimeEnvelope } from '@pi-agents/contracts';
import { router } from '@/navigation';
import { tokens } from '@/theme/tokens';
import { redactSecrets } from './redaction';
import { useChatTrace } from './useChatTrace';

type DetailKind = 'message' | 'toolCall';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findTraceEvent(
  events: RealtimeEnvelope[],
  targetId: string,
  kind: DetailKind,
): RealtimeEnvelope | undefined {
  const fields = kind === 'message' ? ['id', 'messageId'] : ['id', 'toolCallId', 'callId'];
  return events.find((event) => {
    if (event.id === targetId) return true;
    if (!isRecord(event.payload)) return false;
    const payload = event.payload;
    return fields.some((field) => payload[field] === targetId);
  });
}

export function TraceEventDetail({ chatId, targetId, kind }: { chatId: string; targetId: string; kind: DetailKind }) {
  const { data, status, error, refetch } = useChatTrace(chatId);
  const event = data ? findTraceEvent(data, targetId, kind) : undefined;
  const json = useMemo(() => {
    if (!event) return '';
    try {
      return JSON.stringify(redactSecrets(event), null, 2);
    } catch {
      return String(event.payload);
    }
  }, [event]);
  const title = kind === 'message' ? 'Message detail' : 'Tool call detail';

  if (status === 'loading') {
    return <State testID="traceDetail.loading" text="Loading trace event…" loading />;
  }
  if (status === 'error') {
    return <State testID="traceDetail.error" text={error ?? 'Unable to load trace'} actionLabel="Retry" onAction={refetch} />;
  }
  if (!event) {
    return <State testID="traceDetail.notFound" text={`${title} is not available in the current trace.`} actionLabel="Back to trace" onAction={() => router.back()} />;
  }

  return (
    <ScrollView testID="traceDetail.screen" style={{ flex: 1, backgroundColor: tokens.color.background }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: tokens.color.textMuted, marginTop: 4 }}>{event.type}</Text>
      <Text style={{ color: tokens.color.textMuted, marginTop: 2, fontSize: tokens.fontSize.sm }}>{event.createdAt}</Text>
      <Text
        testID="traceDetail.payload"
        style={{
          marginTop: 16,
          color: tokens.color.text,
          backgroundColor: tokens.color.surfaceMuted,
          borderRadius: tokens.radius.md,
          padding: 12,
          fontFamily: 'monospace',
          fontSize: tokens.fontSize.xs,
        }}
      >
        {json}
      </Text>
    </ScrollView>
  );
}

function State({ testID, text, loading = false, actionLabel, onAction }: {
  testID: string;
  text: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: tokens.color.background, padding: 24, alignItems: 'center', justifyContent: 'center' }}>
      {loading ? <ActivityIndicator color={tokens.color.primary} /> : null}
      <Text style={{ color: tokens.color.textMuted, textAlign: 'center', marginTop: 12 }}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" accessibilityLabel={actionLabel} onPress={onAction} style={{ marginTop: 16, paddingVertical: 9, paddingHorizontal: 14, borderRadius: tokens.radius.md, backgroundColor: tokens.color.primary }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
