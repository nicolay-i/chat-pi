import { ScrollView, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { tokens } from '@/theme/tokens';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';
import { QuickActionChip } from './QuickActionChip';
import { ToolCard } from './ToolCard';

export function ChatReferenceScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <MessageBubble role="assistant" text="Привет! Чем могу помочь?" time="14:02" />
        <MessageBubble role="user" text="Напиши debounce на TypeScript" time="14:03" />
        <MessageBubble role="assistant" text="Сейчас добавлю debounce в проект" />
        <ToolCard />
        <View style={{ backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.border, borderRadius: 8, padding: 12, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ backgroundColor: '#F0F6FF', width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
            <Search size={16} color={tokens.color.primary} />
          </View>
          <Text style={{ color: tokens.color.text, fontWeight: '600' }}>search_files</Text>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: 1, borderTopColor: tokens.color.border, backgroundColor: tokens.color.background, paddingHorizontal: 16, paddingBottom: 12, paddingTop: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <QuickActionChip label="↱ Улучшить debounce" />
          <QuickActionChip label="⌘ Commit" />
          <QuickActionChip label="⚗ Тесты" />
        </ScrollView>
        <Composer />
      </View>
    </View>
  );
}
