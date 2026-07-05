import { Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

const diffLines = [
  '+ export function debounce<T>(fn: T, delay: number) {',
  '+   let timer: NodeJS.Timeout;',
  '+   return (...args) => {',
  '+     clearTimeout(timer);',
  '+     timer = setTimeout(() => fn(...args), delay);',
  '+   };',
  '+ }',
];

export function ToolCard() {
  return (
    <View testID="chat.toolCard.editFile" style={{ backgroundColor: tokens.color.surface, borderRadius: 14, overflow: 'hidden', marginVertical: 8 }}>
      <View style={{ padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: tokens.color.text, fontWeight: '700' }}>edit_file</Text>
          <Text style={{ color: tokens.color.textMuted, fontSize: 12 }}>↳ src/utils/debounce.ts</Text>
        </View>
        <View style={{ backgroundColor: tokens.color.successBg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
          <Text style={{ color: tokens.color.successText, fontSize: 11 }}>готово</Text>
        </View>
      </View>
      <View style={{ backgroundColor: tokens.color.codeBg, padding: 12 }}>
        {diffLines.map((line) => (
          <Text key={line} numberOfLines={1} style={{ color: tokens.color.successText, fontFamily: 'monospace', fontSize: 12, lineHeight: 22 }}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}
