import type { TaskStatus } from '@pi-agents/contracts';

export const VALID_STATUSES: ReadonlySet<TaskStatus> = new Set<TaskStatus>([
  'created',
  'creating_worktree',
  'idle',
  'queued',
  'running',
  'aborting',
  'needs_review',
  'stale',
  'checks_running',
  'checks_failed',
  'merge_running',
  'merge_conflict',
  'merged',
  'failed',
  'archived',
]);

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  created: ['creating_worktree', 'idle'],
  creating_worktree: ['idle', 'failed'],
  idle: ['queued', 'archived', 'merge_running'],
  queued: ['running', 'aborting', 'idle'],
  running: ['aborting', 'needs_review', 'checks_running', 'failed'],
  aborting: ['idle', 'failed'],
  needs_review: ['checks_running', 'idle', 'archived', 'merge_running'],
  stale: ['idle', 'archived'],
  checks_running: ['needs_review', 'checks_failed'],
  checks_failed: ['needs_review'],
  merge_running: ['merged', 'merge_conflict', 'failed'],
  merge_conflict: ['merge_running', 'failed'],
  merged: ['archived'],
  failed: ['idle', 'archived'],
  archived: [],
};

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const canTransitionTo = isValidStatusTransition;
