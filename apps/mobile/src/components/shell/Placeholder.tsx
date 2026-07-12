import { Text, View } from 'react-native';
import { useLocalSearchParams } from '@/navigation';
import { tokens } from '@/theme/tokens';

export function Placeholder({ title }: { title: string }) {
  const params = useLocalSearchParams();
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background, padding: 16, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: tokens.color.text, fontSize: tokens.fontSize.lg, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.md, marginTop: 8 }}>placeholder · params: {JSON.stringify(params)}</Text>
    </View>
  );
}
