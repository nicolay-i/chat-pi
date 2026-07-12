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
  'paused_clean',
  'paused_dirty',
  'paused_after_restart',
  'cancelled_archived',
  'cancelled_discarded',
  'failed',
  'archived',
]);

const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  created: ['creating_worktree', 'idle', 'cancelled_archived', 'cancelled_discarded'],
  creating_worktree: ['idle', 'failed'],
  idle: ['queued', 'stale', 'archived', 'merge_running', 'cancelled_archived', 'cancelled_discarded'],
  queued: ['running', 'aborting', 'paused_clean', 'paused_dirty', 'paused_after_restart'],
  running: ['aborting', 'needs_review', 'checks_running', 'failed', 'paused_clean', 'paused_dirty', 'paused_after_restart'],
  aborting: ['paused_clean', 'paused_dirty', 'paused_after_restart', 'failed'],
  paused_clean: ['queued', 'archived', 'cancelled_archived', 'cancelled_discarded', 'merge_running'],
  paused_dirty: ['queued', 'archived', 'cancelled_archived', 'cancelled_discarded'],
  paused_after_restart: ['queued', 'archived', 'cancelled_archived', 'cancelled_discarded'],
  needs_review: ['checks_running', 'idle', 'stale', 'archived', 'merge_running', 'cancelled_archived', 'cancelled_discarded'],
  stale: ['idle', 'archived', 'cancelled_archived', 'cancelled_discarded'],
  checks_running: ['needs_review', 'checks_failed'],
  checks_failed: ['needs_review'],
  merge_running: ['merged', 'merge_conflict', 'failed'],
  merge_conflict: ['merge_running', 'failed'],
  merged: ['archived'],
  cancelled_archived: ['archived'],
  cancelled_discarded: ['archived'],
  failed: ['idle', 'paused_clean', 'paused_dirty', 'archived', 'cancelled_archived', 'cancelled_discarded'],
  archived: [],
};

export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const canTransitionTo = isValidStatusTransition;
