import type { TaskStatus } from '@pi-agents/contracts';
import { getQuickActions, type QuickActionId } from '../quickActions';

function idsFor(context: { taskStatus: TaskStatus | null; hasUncommittedDiff: boolean }): QuickActionId[] {
  return getQuickActions(context).map((a) => a.id);
}

function find(id: QuickActionId, context: { taskStatus: TaskStatus | null; hasUncommittedDiff: boolean }) {
  return getQuickActions(context).find((a) => a.id === id);
}

describe('getQuickActions', () => {
  it('needs_review with uncommitted diff exposes merge enabled and improve enabled', () => {
    const merge = find('merge', { taskStatus: 'needs_review', hasUncommittedDiff: true });
    expect(merge).toBeDefined();
    expect(merge?.enabled).toBe(true);
    const improve = find('improve', { taskStatus: 'needs_review', hasUncommittedDiff: true });
    expect(improve?.enabled).toBe(true);
    const commit = find('commit', { taskStatus: 'needs_review', hasUncommittedDiff: true });
    expect(commit?.enabled).toBe(true);
  });

  it('running task hides merge/rollback (no diff) and disables commit', () => {
    const visible = idsFor({ taskStatus: 'running', hasUncommittedDiff: false });
    expect(visible).not.toContain('merge');
    expect(visible).not.toContain('rollback');
    const tests = find('tests', { taskStatus: 'running', hasUncommittedDiff: false });
    expect(tests?.enabled).toBe(false);
  });

  it('running task with diff still keeps merge hidden-from-enabled even when diff present', () => {
    const merge = find('merge', { taskStatus: 'running', hasUncommittedDiff: true });
    expect(merge?.visible).toBe(true);
    expect(merge?.enabled).toBe(false);
  });

  it('no task (null) shows only always-visible chips, all disabled', () => {
    const visible = idsFor({ taskStatus: null, hasUncommittedDiff: false });
    expect(visible).toEqual(['improve', 'tests', 'commit']);
    for (const action of getQuickActions({ taskStatus: null, hasUncommittedDiff: false })) {
      expect(action.enabled).toBe(false);
    }
  });

  it('checks_failed enables tests action', () => {
    const tests = find('tests', { taskStatus: 'checks_failed', hasUncommittedDiff: false });
    expect(tests?.enabled).toBe(true);
  });

  it('does not mutate input and is pure', () => {
    const ctx = { taskStatus: 'idle' as TaskStatus | null, hasUncommittedDiff: true };
    const a = getQuickActions(ctx).map((x) => ({ id: x.id, enabled: x.enabled }));
    const b = getQuickActions(ctx).map((x) => ({ id: x.id, enabled: x.enabled }));
    expect(a).toEqual(b);
  });
});
