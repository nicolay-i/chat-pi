import type { Task, TaskStatus } from '@pi-agents/contracts';

export type TaskGroups = {
  running: Task[];
  queued: Task[];
  needsReview: Task[];
  stale: Task[];
  merged: Task[];
  archived: Task[];
  other: Task[];
};

const RUNNING_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'running',
  'aborting',
  'checks_running',
  'merge_running',
]);

const QUEUED_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'queued',
  'creating_worktree',
  'created',
]);

const NEEDS_REVIEW_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'needs_review',
  'checks_failed',
  'merge_conflict',
  'failed',
]);

// `idle` is intentionally grouped into `other` (not its own section) to keep
// the list focused on actionable buckets per spec §11.
function bucketOf(status: TaskStatus): keyof TaskGroups {
  if (RUNNING_STATUSES.has(status)) return 'running';
  if (QUEUED_STATUSES.has(status)) return 'queued';
  if (NEEDS_REVIEW_STATUSES.has(status)) return 'needsReview';
  if (status === 'stale') return 'stale';
  if (status === 'merged') return 'merged';
  if (status === 'archived') return 'archived';
  return 'other';
}

export function groupTasksByStatus(tasks: Task[]): TaskGroups {
  const groups: TaskGroups = {
    running: [],
    queued: [],
    needsReview: [],
    stale: [],
    merged: [],
    archived: [],
    other: [],
  };
  for (const task of tasks) {
    groups[bucketOf(task.status)].push(task);
  }
  return groups;
}

export const SECTION_ORDER: ReadonlyArray<keyof TaskGroups> = [
  'running',
  'queued',
  'needsReview',
  'stale',
  'merged',
  'archived',
  'other',
];

export const SECTION_LABELS: Record<keyof TaskGroups, string> = {
  running: 'Running',
  queued: 'Queued',
  needsReview: 'Needs review',
  stale: 'Stale',
  merged: 'Merged',
  archived: 'Archived',
  other: 'Other',
};
