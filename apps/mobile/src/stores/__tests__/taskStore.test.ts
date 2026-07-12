import type { RealtimeEnvelope, Task } from '@pi-agents/contracts';
import { createRootStore } from '../rootStore';

function task(id: string, status: Task['status'] = 'running'): Task {
  return {
    id,
    projectId: 'project-1',
    title: `Task ${id}`,
    mode: 'implementation',
    status,
    branchName: `agents/task/${id}`,
    worktreePath: `/tmp/${id}`,
    changedFiles: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function envelope(
  id: string,
  sequence: number,
  taskId: string,
  type: RealtimeEnvelope['type'],
  payload: unknown,
): RealtimeEnvelope {
  return {
    id,
    sequence,
    stream: 'task',
    streamId: taskId,
    type,
    payload,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('TasksStore', () => {
  it('keeps concurrent task streams independent and retains their runtime state in the background', async () => {
    const events = new Map<string, (event: RealtimeEnvelope) => void>();
    const start = jest.fn();
    const store = createRootStore({
      apiClientFactory: (() => ({
        getTasks: async () => [task('task-a'), task('task-b')],
      })) as never,
      realtimeFactory: (options) => {
        events.set(options.url, options.onEvent);
        return { start, stop: jest.fn() };
      },
    });
    store.backend.baseUrl = 'https://backend.example';

    await store.tasks.hydrateProject('project-1');
    expect(start).toHaveBeenCalledTimes(2);
    expect(store.tasks.activeCount('project-1')).toBe(2);

    events.get('https://backend.example/api/tasks/task-a/events')!(
      envelope('a1', 1, 'task-a', 'task.status.changed', { taskId: 'task-a', status: 'needs_review' }),
    );
    events.get('https://backend.example/api/tasks/task-b/events')!(
      envelope('b1', 1, 'task-b', 'tool.started', { taskId: 'task-b', tool: 'edit_file' }),
    );
    events.get('https://backend.example/api/tasks/task-b/events')!(
      envelope('b2', 2, 'task-b', 'queue.updated', { taskId: 'task-b' }),
    );

    const first = store.tasks.get('task-a')!;
    const second = store.tasks.get('task-b')!;
    expect(first.status).toBe('needs_review');
    expect(first.canMerge).toBe(true);
    expect(second.status).toBe('running');
    expect(second.activeTool).toMatchObject({ name: 'edit_file', status: 'running' });
    expect(second.queue.pending).toBe(1);
    expect(second.lastEventSequence).toBe(2);
  });

  it('exposes stale/rebase and merge/abort computed permissions per task', async () => {
    const store = createRootStore({
      apiClientFactory: (() => ({
        getTasks: async () => [task('stale', 'stale'), task('merge', 'needs_review'), task('idle', 'idle')],
      })) as never,
    });
    store.backend.baseUrl = 'https://backend.example';
    await store.tasks.hydrateProject('project-1');

    const stale = store.tasks.get('stale')!;
    const merge = store.tasks.get('merge')!;
    const idle = store.tasks.get('idle')!;
    expect(stale.needsAttention).toBe(true);
    expect(stale.canRebase).toBe(true);
    expect(stale.canMerge).toBe(false);
    expect(merge.canMerge).toBe(true);
    expect(idle.canMerge).toBe(true);
    expect(idle.canAbort).toBe(false);
  });
});
