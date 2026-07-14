import { Pressable, Text, View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { tokens } from '@/theme/tokens';

export function IgnisFrame({ url }: { url: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open Ignis"
        onPress={() => { window.location.assign(url); }}
        style={{
          alignSelf: 'center',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 24,
          borderRadius: tokens.radius.sm,
          backgroundColor: tokens.color.primary,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Open Ignis</Text>
        <ExternalLink size={16} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
