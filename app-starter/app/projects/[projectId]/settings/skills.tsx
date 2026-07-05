import { Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export default function SkillsScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.background, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: tokens.color.text }}>Skills</Text>
      <Text style={{ marginTop: 8, color: tokens.color.textMuted }}>Placeholder route. Implement according to docs/02-screen-specification.md.</Text>
    </View>
  );
}
