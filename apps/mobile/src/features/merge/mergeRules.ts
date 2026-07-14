import type { TaskStatus } from '@pi-agents/contracts';

const MERGEABLE_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>(['idle', 'needs_review']);

export function canMerge(taskStatus: TaskStatus): boolean {
  return MERGEABLE_STATUSES.has(taskStatus);
}

export function isConflict(taskStatus: TaskStatus): boolean {
  return taskStatus === 'merge_conflict';
}

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
