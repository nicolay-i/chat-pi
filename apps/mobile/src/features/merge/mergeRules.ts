import type { TaskStatus } from '@pi-agents/contracts';

export type MergeStrategy = 'squash' | 'merge' | 'rebase' | 'patch';

const MERGEABLE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['idle', 'needs_review']);

export function canMerge(taskStatus: TaskStatus): boolean {
  return MERGEABLE_STATUSES.has(taskStatus);
}

export function isConflict(taskStatus: TaskStatus): boolean {
  return taskStatus === 'merge_conflict';
}

export const STRATEGY_OPTIONS: ReadonlyArray<{ value: MergeStrategy; label: string }> = [
  { value: 'squash', label: 'Squash' },
  { value: 'merge', label: 'Merge commit' },
  { value: 'rebase', label: 'Rebase' },
  { value: 'patch', label: 'Patch only' },
];

export function defaultCommitMessage(taskTitle: string): string {
  const safe = taskTitle.trim() || 'task';
  return `feat: merge ${safe}`;
}

export type ChecksSummary = 'passed' | 'running' | 'failed';

export function checksSummaryFor(taskStatus: TaskStatus): ChecksSummary {
  if (taskStatus === 'checks_running') return 'running';
  if (taskStatus === 'checks_failed') return 'failed';
  return 'passed';
}
