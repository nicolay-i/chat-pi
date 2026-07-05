import { Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export type MessageRole = 'user' | 'assistant' | 'system' | 'queued' | 'error';

export function MessageBubble({ role, text, time }: { role: MessageRole; text: string; time?: string }) {
  if (role === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: 6 }}>
        <View style={{ backgroundColor: tokens.color.surfaceMuted, paddingHorizontal: 12, paddingVertical: 6, borderRadius: tokens.radius.pill }}>
          <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>{text}</Text>
        </View>
        {time ? <Text style={{ marginTop: 4, color: tokens.color.textMuted, fontSize: tokens.fontSize.xs }}>{time}</Text> : null}
      </View>
    );
  }

  if (role === 'queued') {
    return (
      <View style={{ alignItems: 'flex-start', marginVertical: 6 }}>
        <View
          style={{
            maxWidth: '82%',
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: tokens.radius.md,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: tokens.color.border,
            backgroundColor: 'transparent',
          }}
        >
          <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md }}>{text}</Text>
        </View>
        {time ? <Text style={{ marginTop: 4, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>{time}</Text> : null}
      </View>
    );
  }

  if (role === 'error') {
    return (
      <View style={{ alignItems: 'flex-start', marginVertical: 6 }}>
        <View
          style={{
            maxWidth: '82%',
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderRadius: tokens.radius.md,
            backgroundColor: tokens.color.surface,
            borderWidth: 1,
            borderColor: tokens.color.danger,
          }}
        >
          <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.sm, fontWeight: '700', marginBottom: 4 }}>Ошибка</Text>
          <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.md }}>{text}</Text>
        </View>
        {time ? <Text style={{ marginTop: 4, color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>{time}</Text> : null}
      </View>
    );
  }

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
