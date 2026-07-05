import { ArrowUp, Paperclip } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export function Composer() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 }}>
      <Pressable accessibilityLabel="Прикрепить файл" style={{ padding: 8 }}>
        <Paperclip size={20} color={tokens.color.textMuted} />
      </Pressable>
      <TextInput
        accessibilityLabel="Сообщение"
        placeholder="Сообщение..."
        placeholderTextColor={tokens.color.textMuted}
        style={{ flex: 1, backgroundColor: tokens.color.surfaceMuted, borderRadius: tokens.radius.pill, paddingHorizontal: 18, paddingVertical: 12 }}
      />
      <Pressable accessibilityLabel="Отправить" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ArrowUp size={22} color="#fff" />
      </Pressable>
    </View>
  );
}
