import { Linking, Pressable, Text, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { tokens } from '@/theme/tokens';

export function IgnisFrame({ url }: { url: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open Ignis"
        onPress={() => { void Linking.openURL(url); }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: tokens.color.primary, paddingVertical: 12, paddingHorizontal: 16, borderRadius: tokens.radius.sm }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Open Ignis</Text>
        <ExternalLink size={16} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
