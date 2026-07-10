import type { Task } from '@pi-agents/contracts';
import { groupTasksByStatus } from '../taskGroups';

function makeTask(id: string, status: Task['status']): Task {
  return {
    id,
    projectId: 'p1',
    title: `Task ${id}`,
    mode: 'implementation',
    status,
    branchName: `branch-${id}`,
    worktreePath: `/wt/${id}`,
    changedFiles: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('groupTasksByStatus', () => {
  it('distributes mixed statuses into the correct buckets', () => {
    const tasks: Task[] = [
      makeTask('r1', 'running'),
      makeTask('r2', 'checks_running'),
      makeTask('q1', 'queued'),
      makeTask('q2', 'created'),
      makeTask('nv1', 'needs_review'),
      makeTask('nv2', 'merge_conflict'),
      makeTask('s1', 'stale'),
      makeTask('m1', 'merged'),
      makeTask('a1', 'archived'),
      makeTask('o1', 'idle'),
    ];

    const groups = groupTasksByStatus(tasks);

    expect(groups.running.map((t) => t.id)).toEqual(['r1', 'r2']);
    expect(groups.queued.map((t) => t.id)).toEqual(['q1', 'q2']);
    expect(groups.needsReview.map((t) => t.id)).toEqual(['nv1', 'nv2']);
    expect(groups.stale.map((t) => t.id)).toEqual(['s1']);
    expect(groups.merged.map((t) => t.id)).toEqual(['m1']);
    expect(groups.archived.map((t) => t.id)).toEqual(['a1']);
    expect(groups.other.map((t) => t.id)).toEqual(['o1']);
  });

  it('returns empty arrays for an empty input', () => {
    const groups = groupTasksByStatus([]);
    expect(groups.running).toEqual([]);
    expect(groups.queued).toEqual([]);
    expect(groups.needsReview).toEqual([]);
    expect(groups.other).toEqual([]);
  });

  it('keeps aborting/merge_running in the running bucket', () => {
    const groups = groupTasksByStatus([makeTask('ab', 'aborting'), makeTask('mr', 'merge_running')]);
    expect(groups.running.map((t) => t.id)).toEqual(['ab', 'mr']);
  });
});
