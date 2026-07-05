import { useState } from 'react';
import { ArrowUp, Paperclip } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export type ComposerProps = {
  value?: string;
  onValueChange?: (text: string) => void;
  onSend?: () => void;
  disabled?: boolean;
};

export function Composer({ value, onValueChange, onSend, disabled }: ComposerProps) {
  const [internal, setInternal] = useState('');
  const controlled = onValueChange !== undefined;
  const current = controlled ? (value ?? '') : internal;

  const handleChange = (text: string) => {
    if (controlled) {
      onValueChange!(text);
    } else {
      setInternal(text);
    }
  };

  const handleSend = () => {
    if (disabled) return;
    if (onSend) {
      onSend();
    } else {
      setInternal('');
    }
  };

  const canSend = !disabled && current.trim().length > 0;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 }}>
      <Pressable accessibilityLabel="Прикрепить файл" style={{ padding: 8 }}>
        <Paperclip size={20} color={tokens.color.textMuted} />
      </Pressable>
      <TextInput
        accessibilityLabel="Сообщение"
        placeholder="Сообщение..."
        placeholderTextColor={tokens.color.textMuted}
        value={current}
        onChangeText={handleChange}
        style={{ flex: 1, backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.pill, paddingHorizontal: 18, paddingVertical: 12 }}
      />
      <Pressable
        accessibilityLabel="Отправить"
        accessibilityRole="button"
        testID="chat.composer.send"
        onPress={handleSend}
        disabled={!canSend}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: canSend ? tokens.color.primary : tokens.color.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ArrowUp size={22} color="#fff" />
      </Pressable>
    </View>
  );
}
