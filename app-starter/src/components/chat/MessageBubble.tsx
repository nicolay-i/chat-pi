import { Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export function MessageBubble({ role, text, time }: { role: 'user' | 'assistant'; text: string; time?: string }) {
  const isUser = role === 'user';
  return (
    <View style={{ alignItems: isUser ? 'flex-end' : 'flex-start', marginVertical: 6 }}>
      <View
        style={{
          maxWidth: '82%',
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: tokens.radius.md,
          backgroundColor: isUser ? tokens.color.primary : tokens.color.surface,
        }}
      >
        <Text style={{ color: isUser ? '#fff' : tokens.color.text, fontSize: tokens.fontSize.md }}>{text}</Text>
      </View>
      {time ? <Text style={{ marginTop: 4, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>{time}</Text> : null}
    </View>
  );
}
