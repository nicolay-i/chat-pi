import { describe, expect, it } from 'vitest';
import { InMemoryProjectOperationMutex } from '../projectOperationMutex';

describe('InMemoryProjectOperationMutex', () => {
  it('serializes operations for one project while allowing other projects to proceed', async () => {
    const mutex = new InMemoryProjectOperationMutex();
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

    const first = mutex.run('project-a', async () => {
      order.push('a1:start');
      await firstGate;
      order.push('a1:end');
    });
    const second = mutex.run('project-a', async () => {
      order.push('a2:start');
      order.push('a2:end');
    });
    const other = mutex.run('project-b', async () => {
      order.push('b1:start');
      order.push('b1:end');
    });

    await other;
    expect(order).toEqual(['a1:start', 'b1:start', 'b1:end']);

    releaseFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(['a1:start', 'b1:start', 'b1:end', 'a1:end', 'a2:start', 'a2:end']);
  });
});
