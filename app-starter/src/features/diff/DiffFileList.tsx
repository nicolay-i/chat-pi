import { Pressable, ScrollView, Text, View } from 'react-native';
import type { DiffEntry } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';

type StatusStyle = { bg: string; text: string; label: string };

const STATUS_STYLES: Record<DiffEntry['status'], StatusStyle> = {
  added: { bg: tokens.color.successBg, text: tokens.color.successText, label: 'added' },
  modified: { bg: tokens.color.surfaceMuted, text: tokens.color.textMuted, label: 'modified' },
  deleted: { bg: '#FFECEC', text: tokens.color.danger, label: 'deleted' },
  renamed: { bg: '#E8F1FF', text: '#2563EB', label: 'renamed' },
};

export function encodePathForTestID(path: string): string {
  return path.replace(/\//g, '_');
}

export function DiffFileList({
  entries,
  selectedPath,
  onSelect,
}: {
  entries: DiffEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <View testID="diff.fileList" style={{ flex: 1 }}>
      <ScrollView>
        {entries.map((entry) => {
          const style = STATUS_STYLES[entry.status];
          const selected = entry.path === selectedPath;
          return (
            <Pressable
              key={entry.path}
              testID={`diff.file.${encodePathForTestID(entry.path)}`}
              accessibilityLabel={`Select file ${entry.path}`}
              onPress={() => onSelect(entry.path)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 8,
                paddingHorizontal: 10,
                backgroundColor: selected ? `${tokens.color.primary}14` : tokens.color.surface,
                borderWidth: 1,
                borderColor: selected ? tokens.color.primary : tokens.color.border,
                borderRadius: tokens.radius.sm,
                marginBottom: 6,
              }}
            >
              <View style={{ flex: 1, flexShrink: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: tokens.color.text, fontFamily: 'monospace', fontSize: tokens.fontSize.sm }}
                >
                  {entry.path}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <Text style={{ color: tokens.color.successText, fontSize: tokens.fontSize.xs, marginRight: 8 }}>
                    +{entry.additions}
                  </Text>
                  <Text style={{ color: tokens.color.danger, fontSize: tokens.fontSize.xs }}>-{entry.deletions}</Text>
                </View>
              </View>
              <View
                style={{
                  backgroundColor: style.bg,
                  borderRadius: tokens.radius.pill,
                  paddingVertical: 3,
                  paddingHorizontal: 8,
                  marginLeft: 8,
                }}
              >
                <Text style={{ color: style.text, fontWeight: '700', fontSize: tokens.fontSize.xs }}>{style.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
