import type { SendMessageInput, TaskStatus } from '@pi-agents/contracts';

export type SendMessageBehavior = SendMessageInput['behavior'];

const FOLLOW_UP_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'running',
  'queued',
  'aborting',
  'checks_running',
  'merge_running',
]);

const STEER_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['running', 'queued']);

const ABORT_AND_REPLACE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'running',
  'queued',
  'aborting',
]);

/**
 * Pure helper: decides whether a composer behavior is enabled given the
 * active task status. `null` status means discussion chat with no task.
 */
export function isBehaviorEnabled(
  behavior: SendMessageBehavior,
  taskStatus: TaskStatus | null | undefined,
): boolean {
  const status = taskStatus ?? null;
  switch (behavior) {
    case 'send':
      return true;
    case 'follow_up':
      return status !== null && FOLLOW_UP_STATUSES.has(status);
    case 'steer':
      return status !== null && STEER_STATUSES.has(status);
    case 'abort_and_replace':
      return status !== null && ABORT_AND_REPLACE_STATUSES.has(status);
    default:
      return false;
  }
}

export type BehaviorOption = {
  behavior: SendMessageBehavior;
  label: string;
  hint: string;
  accessibilityLabel: string;
};

export const BEHAVIOR_OPTIONS: readonly BehaviorOption[] = [
  {
    behavior: 'send',
    label: 'Отправить',
    hint: 'Новое сообщение или запуск задачи',
    accessibilityLabel: 'Режим отправить',
  },
  {
    behavior: 'follow_up',
    label: 'Дополнить',
    hint: 'Добавить в очередь активной задачи',
    accessibilityLabel: 'Режим дополнить',
  },
  {
    behavior: 'steer',
    label: 'Направить',
    hint: 'Скорректировать текущий запуск',
    accessibilityLabel: 'Режим направить',
  },
  {
    behavior: 'abort_and_replace',
    label: 'Заменить',
    hint: 'Прервать и заменить текущий запуск',
    accessibilityLabel: 'Режим заменить',
  },
];
