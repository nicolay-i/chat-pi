import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';
import { Composer } from '@/components/chat/Composer';
import type { SendMessageBehavior } from '@/components/chat/composerRules';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { QuickActionChip } from '@/components/chat/QuickActionChip';
import { ToolCard } from '@/components/chat/ToolCard';
import { getQuickActions } from '@/features/actions/quickActions';
import { useChatThread } from './useChatThread';

const DOT_SIZE = 8;

function connectionLabel(status: string): string {
  switch (status) {
    case 'open':
      return 'в сети';
    case 'connecting':
      return 'подключение…';
    case 'reconnecting':
      return 'переподключение…';
    case 'error':
      return 'ошибка';
    default:
      return 'ожидание';
  }
}

function dotColor(status: string): string {
  if (status === 'open') return tokens.color.successText;
  if (status === 'error') return tokens.color.danger;
  return tokens.color.textMuted;
}

function formatTime(iso: string): string {
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return iso;
  return `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;
}

function ToolCardDemo() {
  const [expanded, setExpanded] = useState(true);
  return (
    <Pressable testID="chat.thread.toolCardDemo" onPress={() => setExpanded((v) => !v)}>
      <ToolCard
        toolName="edit_file"
        filePath="src/utils/debounce.ts"
        status="completed"
        diff={[
          '+ export function debounce<T>(fn: T, delay: number) {',
          '+   return (...args) => clearTimeout(setTimeout(fn, delay));',
          '+ }',
        ]}
        expanded={expanded}
      />
      <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 4, textAlign: 'center' }}>
        Нажмите, чтобы свернуть/развернуть
      </Text>
    </Pressable>
  );
}

export function ChatThread({ chatId }: { chatId: string }) {
  const { messages, connectionStatus, isOffline, sending, taskStatus, send } = useChatThread(chatId);
  const [draft, setDraft] = useState('');
  const [behavior, setBehavior] = useState<SendMessageBehavior>('send');

  const empty = messages.length === 0;
  const connecting = connectionStatus === 'connecting' || connectionStatus === 'idle';
  const lastMessage = messages[messages.length - 1];
  const showStreamingCursor =
    connectionStatus === 'open' && lastMessage?.role === 'assistant' && lastMessage.complete !== true;

  const handleSend = () => {
    const text = draft;
    setDraft('');
    void send(text, behavior);
  };

  const quickActions = getQuickActions({
    taskStatus: taskStatus,
    hasUncommittedDiff: false,
  });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={{
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: tokens.color.border,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.lg }}>
            {chatId}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <View
              style={{
                backgroundColor: tokens.color.surfaceMuted,
                borderRadius: tokens.radius.pill,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>chat</Text>
            </View>
            <View
              testID="chat.thread.connectionPill"
              accessibilityLabel={`Connection ${connectionLabel(connectionStatus)}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <View style={{ width: DOT_SIZE, height: DOT_SIZE, borderRadius: DOT_SIZE / 2, backgroundColor: dotColor(connectionStatus) }} />
              <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>
                {connectionLabel(connectionStatus)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {isOffline ? (
        <View
          testID="chat.thread.offlineBanner"
          style={{ backgroundColor: tokens.color.danger, paddingHorizontal: 16, paddingVertical: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: tokens.fontSize.sm }}>
            Нет соединения. Переподключение…
          </Text>
        </View>
      ) : null}

      <ScrollView
        testID="chat.thread.messages"
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        {empty && connecting ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
            <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md }}>
              Подключение к чату…
            </Text>
          </View>
        ) : null}

        {empty && !connecting ? (
          <View>
            <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md, textAlign: 'center', paddingVertical: 24 }}>
              Сообщений пока нет. Отправьте первое сообщение.
            </Text>
            <ToolCardDemo />
          </View>
        ) : null}

        {messages.map((m) => {
          const isLast = m.id === lastMessage?.id;
          return (
            <View key={m.id}>
              <MessageBubble role={m.role} text={m.text} time={formatTime(m.createdAt)} />
              {isLast && showStreamingCursor ? (
                <View testID="chat.thread.streamingCursor" style={{ paddingHorizontal: 14, marginTop: 2 }}>
                  <Text style={{ color: tokens.color.primary, fontSize: tokens.fontSize.md, fontWeight: '700' }}>▍</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View
        testID="chat.thread.composer"
        style={{
          borderTopWidth: 1,
          borderTopColor: tokens.color.border,
          backgroundColor: tokens.color.background,
          paddingHorizontal: 16,
          paddingBottom: 12,
          paddingTop: 8,
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {quickActions.map((action) => (
            <QuickActionChip
              key={action.id}
              label={action.label}
              disabled={!action.enabled}
              onPress={action.onPress}
            />
          ))}
        </ScrollView>
        <Composer
          value={draft}
          onValueChange={setDraft}
          onSend={handleSend}
          disabled={sending}
          behavior={behavior}
          onBehaviorChange={setBehavior}
          taskStatus={taskStatus}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
