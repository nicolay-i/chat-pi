import { Text, View } from 'react-native';
import type { TaskStatus } from '@pi-agents/contracts';
import { tokens } from '@/theme/tokens';

type BadgeStyle = { bg: string; text: string };

const STATUS_STYLES: Record<TaskStatus, BadgeStyle> = {
  created: { bg: tokens.color.surfaceMuted, text: tokens.color.textMuted },
  creating_worktree: { bg: '#FFF3E0', text: '#EA580C' },
  idle: { bg: tokens.color.surfaceMuted, text: tokens.color.textMuted },
  queued: { bg: '#FFF3E0', text: '#EA580C' },
  running: { bg: '#E8F1FF', text: '#2563EB' },
  aborting: { bg: '#FFECEC', text: '#C2410C' },
  needs_review: { bg: '#FEF6E0', text: '#B45309' },
  stale: { bg: '#F3E8FF', text: '#7C3AED' },
  checks_running: { bg: '#E8F1FF', text: '#2563EB' },
  checks_failed: { bg: '#FFECEC', text: tokens.color.danger },
  merge_running: { bg: '#E8F1FF', text: '#2563EB' },
  merge_conflict: { bg: '#FFECEC', text: tokens.color.danger },
  merged: { bg: tokens.color.successBg, text: tokens.color.successText },
  paused_clean: { bg: '#FFF3E0', text: '#B45309' },
  paused_dirty: { bg: '#FFECEC', text: '#C2410C' },
  paused_after_restart: { bg: '#F3E8FF', text: '#7C3AED' },
  cancelled_archived: { bg: tokens.color.surfaceMuted, text: tokens.color.textMuted },
  cancelled_discarded: { bg: tokens.color.surfaceMuted, text: tokens.color.textMuted },
  failed: { bg: '#FFECEC', text: tokens.color.danger },
  archived: { bg: tokens.color.surfaceMuted, text: tokens.color.textMuted },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const style = STATUS_STYLES[status];
  return (
    <View
      style={{
        backgroundColor: style.bg,
        borderRadius: tokens.radius.pill,
        paddingVertical: 4,
        paddingHorizontal: 10,
      }}
    >
      <Text
        style={{
          color: style.text,
          fontWeight: '700',
          fontSize: tokens.fontSize.xs,
          textTransform: 'capitalize',
        }}
      >
        {status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}
