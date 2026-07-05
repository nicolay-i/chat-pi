import type { TaskStatus } from '@pi-agents/contracts';

export type QuickActionId = 'improve' | 'merge' | 'tests' | 'rollback' | 'commit';

export type QuickAction = {
  id: QuickActionId;
  label: string;
  onPress?: () => void;
  visible: boolean;
  enabled: boolean;
};

export type QuickActionContext = {
  taskStatus: TaskStatus | null;
  hasUncommittedDiff: boolean;
};

const IDLE_LIKE: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['idle', 'needs_review']);

/**
 * Pure helper that returns the contextual quick action chips for a chat thread.
 * Visibility and enabled-state are derived from task status and diff presence.
 */
export function getQuickActions(context: QuickActionContext): QuickAction[] {
  const { taskStatus, hasUncommittedDiff } = context;

  const actions: QuickAction[] = [
    {
      id: 'improve',
      label: 'Улучшить',
      visible: true,
      enabled: taskStatus === 'needs_review',
    },
    {
      id: 'merge',
      label: 'Слить в repo',
      visible: hasUncommittedDiff,
      enabled: taskStatus !== null && IDLE_LIKE.has(taskStatus),
    },
    {
      id: 'tests',
      label: 'Тесты',
      visible: true,
      enabled: taskStatus !== null && (IDLE_LIKE.has(taskStatus) || taskStatus === 'checks_failed'),
    },
    {
      id: 'rollback',
      label: 'Откатить',
      visible: hasUncommittedDiff,
      enabled: taskStatus !== null && IDLE_LIKE.has(taskStatus),
    },
    {
      id: 'commit',
      label: 'Commit',
      visible: true,
      enabled: hasUncommittedDiff && taskStatus !== null && IDLE_LIKE.has(taskStatus),
    },
  ];

  return actions.filter((a) => a.visible);
}
