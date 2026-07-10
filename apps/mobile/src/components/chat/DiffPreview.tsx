import { Text, View } from 'react-native';
import { tokens } from '@/theme/tokens';

export function DiffPreview({ lines, testID = 'chat.diffPreview' }: { lines: string[]; testID?: string }) {
  return (
    <View testID={testID} style={{ backgroundColor: tokens.color.codeBg, padding: 12 }}>
      {lines.map((line, index) => {
        const color = line.startsWith('+')
          ? tokens.color.successText
          : line.startsWith('-')
            ? tokens.color.danger
            : tokens.color.text;
        return (
          <Text
            key={`${index}-${line}`}
            numberOfLines={1}
            style={{ color, fontFamily: 'monospace', fontSize: tokens.fontSize.sm, lineHeight: 22 }}
          >
            {line}
          </Text>
        );
      })}
    </View>
  );
}
