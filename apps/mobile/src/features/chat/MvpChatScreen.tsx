import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { observer } from '@/lib/observer';
import { rootStore } from '@/stores/rootStore';
import { tokens } from '@/theme/tokens';

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const MvpChatScreen = observer(function MvpChatScreen({ chatId }: { chatId: string }) {
  const [draft, setDraft] = useState('');
  const { chat } = rootStore;

  useEffect(() => {
    chat.open(chatId);
    return () => chat.close();
  }, [chat, chatId]);

  const send = (): void => {
    const text = draft;
    setDraft('');
    void chat.send(text);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: tokens.color.border }}>
        <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>
          Новый чат
        </Text>
        <Text style={{ marginTop: 4, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>
          {chat.connectionStatus === 'open' ? 'Подключено' : 'Подключение к агенту'}
        </Text>
      </View>

      {chat.isOffline ? (
        <View style={{ backgroundColor: tokens.color.danger, padding: 10 }}>
          <Text style={{ color: '#FFFFFF', textAlign: 'center' }}>Соединение восстанавливается</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
        {chat.messages.length === 0 ? (
          <Text style={{ color: tokens.color.textMuted, textAlign: 'center', marginTop: 32 }}>
            Напишите первое сообщение агенту.
          </Text>
        ) : null}
        {chat.messages.map((message) => {
          const user = message.role === 'user';
          return (
            <View
              key={message.id}
              style={{
                alignSelf: user ? 'flex-end' : 'flex-start',
                maxWidth: '86%',
                backgroundColor: user ? tokens.color.primary : tokens.color.surface,
                borderRadius: tokens.radius.md,
                padding: 12,
              }}
            >
              <Text style={{ color: user ? '#FFFFFF' : tokens.color.text }}>{message.text}</Text>
              <Text style={{ color: user ? '#E7E5FF' : tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 6 }}>
                {formatTime(message.createdAt)}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: tokens.color.border, padding: 12 }}>
        {chat.error ? <Text style={{ color: tokens.color.danger, marginBottom: 8 }}>{chat.error}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            testID="mvp-chat.composer"
            value={draft}
            onChangeText={setDraft}
            placeholder="Сообщение агенту"
            placeholderTextColor={tokens.color.textMuted}
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              borderWidth: 1,
              borderColor: tokens.color.border,
              borderRadius: tokens.radius.md,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: tokens.color.text,
              backgroundColor: tokens.color.surface,
            }}
          />
          <Pressable
            testID="mvp-chat.send"
            accessibilityRole="button"
            accessibilityLabel="Отправить сообщение"
            disabled={chat.sending || !draft.trim()}
            onPress={send}
            style={{
              alignSelf: 'flex-end',
              backgroundColor: tokens.color.primary,
              borderRadius: tokens.radius.md,
              paddingHorizontal: 16,
              paddingVertical: 13,
              opacity: chat.sending || !draft.trim() ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Отправить</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
});
