import { describe, expect, it, vi } from 'vitest';
import { createGracefulShutdown, createJsonLogger } from './lifecycle';

describe('createJsonLogger', () => {
  it('writes machine-readable lifecycle records', () => {
    const write = vi.fn();
    const logger = createJsonLogger(write, () => new Date('2026-07-11T10:00:00.000Z'));

    logger.info('api.started', { port: 8787 });

    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      time: '2026-07-11T10:00:00.000Z', level: 'info', event: 'api.started', port: 8787,
    });
  });
});

describe('createGracefulShutdown', () => {
  it('closes once, clears the forced timer and exits successfully', () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const clearTimer = vi.fn();
    const exit = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const shutdown = createGracefulShutdown({
      server: { close }, logger, exit, beforeClose: vi.fn(),
      setTimer: () => ({ unref: vi.fn() }), clearTimer,
    });

    shutdown('SIGTERM');
    shutdown('SIGINT');

    expect(close).toHaveBeenCalledTimes(1);
    expect(clearTimer).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(logger.info).toHaveBeenCalledWith('api.shutdown_completed', { signal: 'SIGTERM' });
  });

  it('forces an exit when the server does not close in time', () => {
    let onTimeout: (() => void) | undefined;
    const exit = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const shutdown = createGracefulShutdown({
      server: { close: vi.fn() }, logger, exit, forceAfterMs: 12,
      setTimer: (handler) => { onTimeout = handler; return {}; }, clearTimer: vi.fn(),
    });

    shutdown('SIGINT');
    onTimeout?.();

    expect(exit).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalledWith('api.shutdown_timeout', { signal: 'SIGINT', forceAfterMs: 12 });
  });

  it('waits for asynchronous cleanup before closing the server', async () => {
    let completeCleanup: (() => void) | undefined;
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const shutdown = createGracefulShutdown({
      server: { close }, logger, exit: vi.fn(),
      beforeClose: () => new Promise<void>((resolve) => { completeCleanup = resolve; }),
      setTimer: () => ({ unref: vi.fn() }), clearTimer: vi.fn(),
    });

    shutdown('SIGTERM');
    expect(close).not.toHaveBeenCalled();
    completeCleanup?.();
    await Promise.resolve();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('logs cleanup failure and still closes the server', async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const shutdown = createGracefulShutdown({
      server: { close }, logger, exit: vi.fn(),
      beforeClose: async () => { throw new Error('pi cleanup failed'); },
      setTimer: () => ({ unref: vi.fn() }), clearTimer: vi.fn(),
    });

    shutdown('SIGINT');
    await Promise.resolve();

    expect(logger.warn).toHaveBeenCalledWith('api.shutdown_cleanup_failed', {
      signal: 'SIGINT', error: 'pi cleanup failed',
    });
    expect(close).toHaveBeenCalledTimes(1);
  });
});
