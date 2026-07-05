import type { TaskStatus } from '@pi-agents/contracts';
import { isBehaviorEnabled, type SendMessageBehavior } from '../composerRules';

const ALL_STATUSES: TaskStatus[] = [
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
];

const BEHAVIORS: SendMessageBehavior[] = ['send', 'follow_up', 'steer', 'abort_and_replace'];

describe('isBehaviorEnabled', () => {
  it('send is always enabled regardless of task status', () => {
    for (const status of ALL_STATUSES) {
      expect(isBehaviorEnabled('send', status)).toBe(true);
    }
    expect(isBehaviorEnabled('send', null)).toBe(true);
    expect(isBehaviorEnabled('send', undefined)).toBe(true);
  });

  it('follow_up is enabled only when a task is running/queued/aborting/checks_running/merge_running', () => {
    const enabled = new Set<TaskStatus>([
      'running',
      'queued',
      'aborting',
      'checks_running',
      'merge_running',
    ]);
    for (const status of ALL_STATUSES) {
      expect(isBehaviorEnabled('follow_up', status)).toBe(enabled.has(status));
    }
  });

  it('follow_up disabled when there is no active task', () => {
    expect(isBehaviorEnabled('follow_up', null)).toBe(false);
  });

  it('steer is enabled only for running and queued', () => {
    for (const status of ALL_STATUSES) {
      const expected = status === 'running' || status === 'queued';
      expect(isBehaviorEnabled('steer', status)).toBe(expected);
    }
  });

  it('abort_and_replace is enabled for running, queued, aborting', () => {
    for (const status of ALL_STATUSES) {
      const expected =
        status === 'running' || status === 'queued' || status === 'aborting';
      expect(isBehaviorEnabled('abort_and_replace', status)).toBe(expected);
    }
  });

  it('null task status disables every behavior except send', () => {
    for (const behavior of BEHAVIORS) {
      const expected = behavior === 'send';
      expect(isBehaviorEnabled(behavior, null)).toBe(expected);
    }
  });
});
