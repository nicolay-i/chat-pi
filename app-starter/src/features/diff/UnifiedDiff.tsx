import { ScrollView, Text, View } from 'react-native';
import type { DiffFileContent } from '@pi-agents/contracts';
import { DiffPreview } from '@/components/chat/DiffPreview';
import { tokens } from '@/theme/tokens';

export function countHunkLines(content: DiffFileContent): number {
  return content.hunks.reduce((sum, h) => sum + h.lines.length, 0);
}

const LARGE_THRESHOLD = 500;

export function UnifiedDiff({ content }: { content: DiffFileContent | null }) {
  if (!content) {
    return (
      <View testID="diff.unified" style={{ flex: 1, padding: 12 }}>
        <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>Select a file to view its diff.</Text>
      </View>
    );
  }

  const totalLines = countHunkLines(content);
  const isLarge = totalLines > LARGE_THRESHOLD;
  const isMarkdown = content.path.endsWith('.md');

  return (
    <View testID="diff.unified" style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
        <Text
          numberOfLines={1}
          style={{ color: tokens.color.text, fontFamily: 'monospace', fontSize: tokens.fontSize.sm, fontWeight: '700' }}
        >
          {content.path}
        </Text>
      </View>

      {isMarkdown ? (
        <View
          testID="diff.markdownPlaceholder"
          style={{
            marginHorizontal: 12,
            marginBottom: 8,
            padding: 12,
            backgroundColor: tokens.color.surfaceMuted,
            borderRadius: tokens.radius.md,
          }}
        >
          <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.sm }}>Markdown rendered diff (preview)</Text>
        </View>
      ) : null}

      {isLarge ? (
        <View
          testID="diff.largeWarning"
          style={{
            marginHorizontal: 12,
            marginBottom: 8,
            padding: 10,
            backgroundColor: '#FFF6E0',
            borderRadius: tokens.radius.sm,
          }}
        >
          <Text style={{ color: '#B45309', fontSize: tokens.fontSize.sm, fontWeight: '700' }}>Большой файл</Text>
          <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 }}>
            Показано {totalLines} строк; рендер может быть медленным.
          </Text>
        </View>
      ) : null}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12 }}>
        {content.hunks.map((hunk, index) => (
          <View key={`${index}-${hunk.header}`} style={{ marginBottom: 12 }}>
            <Text
              numberOfLines={1}
              style={{
                color: tokens.color.textMuted,
                fontFamily: 'monospace',
                fontSize: tokens.fontSize.xs,
                paddingVertical: 4,
              }}
            >
              {hunk.header}
            </Text>
            <DiffPreview lines={hunk.lines} />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
