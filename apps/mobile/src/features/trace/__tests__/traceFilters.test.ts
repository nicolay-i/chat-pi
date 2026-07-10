import type { EventType, RealtimeEnvelope } from '@pi-agents/contracts';
import { filterEvents } from '../traceFilters';

function env(
  id: string,
  type: EventType,
  payload: unknown = {},
): RealtimeEnvelope {
  return {
    id,
    stream: 'chat',
    streamId: 'c1',
    type,
    payload,
    createdAt: '2026-01-01T10:00:00.000Z',
  };
}

const MIXED: RealtimeEnvelope[] = [
  env('m1', 'message.created', { role: 'user' }),
  env('t1', 'tool.started', { name: 'edit_file' }),
  env('r1', 'run.started'),
  env('c1', 'checkpoint.created'),
  env('d1', 'diff.updated'),
  env('q1', 'queue.updated'),
  env('re1', 'run.error'),
  env('ts1', 'task.status.changed', { status: 'failed' }),
  env('mc1', 'merge.conflict'),
  env('ts2', 'task.status.changed', { status: 'idle' }),
];

describe('filterEvents', () => {
  it('all returns every event', () => {
    expect(filterEvents(MIXED, 'all')).toHaveLength(MIXED.length);
  });

  it('messages filters to message.* only', () => {
    const result = filterEvents(MIXED, 'messages');
    expect(result.map((e) => e.id)).toEqual(['m1']);
  });

  it('tools filters to tool.* only', () => {
    const result = filterEvents(MIXED, 'tools');
    expect(result.map((e) => e.id)).toEqual(['t1']);
  });

  it('runs filters to run.* only', () => {
    const result = filterEvents(MIXED, 'runs');
    expect(result.map((e) => e.id)).toEqual(['r1', 're1']);
  });

  it('checkpoints filters to checkpoint.* only', () => {
    const result = filterEvents(MIXED, 'checkpoints');
    expect(result.map((e) => e.id)).toEqual(['c1']);
  });

  it('diffs filters to diff.* only', () => {
    const result = filterEvents(MIXED, 'diffs');
    expect(result.map((e) => e.id)).toEqual(['d1']);
  });

  it('queue filters to queue.* only', () => {
    const result = filterEvents(MIXED, 'queue');
    expect(result.map((e) => e.id)).toEqual(['q1']);
  });

  it('errors captures run.error, merge.conflict, and failed task.status.changed', () => {
    const result = filterEvents(MIXED, 'errors');
    expect(result.map((e) => e.id).sort()).toEqual(['mc1', 're1', 'ts1']);
  });
});
