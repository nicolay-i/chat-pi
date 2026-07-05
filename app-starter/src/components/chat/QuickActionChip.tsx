import { Pressable, Text } from 'react-native';
import { tokens } from '@/theme/tokens';

export function QuickActionChip({ label, onPress }: { label: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityLabel={label} onPress={onPress} style={{ backgroundColor: tokens.color.surface, borderRadius: tokens.radius.pill, paddingHorizontal: 14, paddingVertical: 9, marginRight: 8 }}>
      <Text style={{ color: tokens.color.primary, fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}
