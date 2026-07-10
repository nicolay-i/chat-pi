import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Checkpoint } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';

export type CheckpointTreeProps = {
  checkpoints: Checkpoint[];
  activeCheckpointId?: string;
  onFork: (id: string) => void;
  onRollback: (id: string) => void;
  onViewDiff: (id: string) => void;
};

function truncateSha(sha: string | undefined): string {
  if (!sha) return '—';
  return sha.length <= 8 ? sha : sha.slice(0, 8);
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export function CheckpointTree({
  checkpoints,
  activeCheckpointId,
  onFork,
  onRollback,
  onViewDiff,
}: CheckpointTreeProps) {
  if (checkpoints.length === 0) {
    return null;
  }
  return (
    <ScrollView
      testID="checkpoint.tree"
      style={{ flex: 1, backgroundColor: tokens.color.background }}
      contentContainerStyle={{ padding: 12 }}
    >
      {checkpoints.map((cp, index) => {
        const active = cp.id === activeCheckpointId;
        const isLast = index === checkpoints.length - 1;
        return (
          <View key={cp.id} style={{ flexDirection: 'row' }}>
            <View style={{ alignItems: 'center', width: 24 }}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  marginTop: 6,
                  backgroundColor: active ? tokens.color.primary : tokens.color.border,
                  borderWidth: active ? 0 : 1,
                  borderColor: tokens.color.textMuted,
                }}
              />
              {!isLast ? (
                <View style={{ flex: 1, width: 2, backgroundColor: tokens.color.border, marginTop: 2 }} />
              ) : null}
            </View>
            <View style={{ flex: 1, marginLeft: 8, marginBottom: isLast ? 0 : 12 }}>
              <View
                testID={`checkpoint.item.${cp.id}`}
                style={{
                  backgroundColor: tokens.color.surface,
                  borderRadius: tokens.radius.md,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: active ? tokens.color.primary : tokens.color.border,
                }}
              >
                <Text
                  style={{ color: tokens.color.text, fontWeight: '700', fontSize: tokens.fontSize.md }}
                  numberOfLines={2}
                >
                  {cp.message}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 6, alignItems: 'center' }}>
                  <Text
                    style={{
                      color: tokens.color.textMuted,
                      fontSize: tokens.fontSize.xs,
                      fontFamily: 'monospace',
                    }}
                  >
                    {truncateSha(cp.sha)}
                  </Text>
                  <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginLeft: 8 }}>
                    · {cp.changedFiles} file{cp.changedFiles === 1 ? '' : 's'}
                  </Text>
                </View>
                <Text style={{ color: tokens.color.textMuted, fontSize: tokens.fontSize.xs, marginTop: 2 }}>
                  {formatCreatedAt(cp.createdAt)}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' }}>
                  <Pressable
                    testID={`checkpoint.fork.${cp.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Fork from checkpoint"
                    onPress={() => onFork(cp.id)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: tokens.radius.pill,
                      borderWidth: 1,
                      borderColor: tokens.color.primary,
                      marginRight: 8,
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ color: tokens.color.primary, fontWeight: '700', fontSize: tokens.fontSize.sm }}>
                      Fork
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`checkpoint.rollback.${cp.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="Rollback to checkpoint"
                    onPress={() => onRollback(cp.id)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: tokens.radius.pill,
                      borderWidth: 1,
                      borderColor: tokens.color.danger,
                      marginRight: 8,
                      marginBottom: 6,
                    }}
                  >
                    <Text style={{ color: tokens.color.danger, fontWeight: '700', fontSize: tokens.fontSize.sm }}>
                      Rollback
                    </Text>
                  </Pressable>
                  <Pressable
                    testID={`checkpoint.viewDiff.${cp.id}`}
                    accessibilityRole="button"
                    accessibilityLabel="View checkpoint diff"
                    onPress={() => onViewDiff(cp.id)}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: tokens.radius.pill,
                      borderWidth: 1,
                      borderColor: tokens.color.border,
                      marginBottom: 6,
                      backgroundColor: tokens.color.surfaceMuted,
                    }}
                  >
                    <Text style={{ color: tokens.color.textMuted, fontWeight: '700', fontSize: tokens.fontSize.sm }}>
                      View diff
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
