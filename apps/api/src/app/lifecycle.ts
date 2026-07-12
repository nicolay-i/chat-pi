export type LifecycleLogger = {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
};

type LogWriter = (line: string) => void;

export function createJsonLogger(
  write: LogWriter = (line) => console.log(line),
  now: () => Date = () => new Date(),
): LifecycleLogger {
  const log = (level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) => {
    write(JSON.stringify({ time: now().toISOString(), level, event, ...fields }));
  };
  return {
    info: (event, fields) => log('info', event, fields),
    warn: (event, fields) => log('warn', event, fields),
    error: (event, fields) => log('error', event, fields),
  };
}

export type CloseableServer = {
  close(callback: (error?: Error) => void): unknown;
};

type TimeoutHandle = { unref?: () => void };

export function createGracefulShutdown(options: {
  server: CloseableServer;
  logger: LifecycleLogger;
  exit: (code: number) => void;
  beforeClose?: () => void | Promise<void>;
  forceAfterMs?: number;
  setTimer?: (handler: () => void, timeoutMs: number) => TimeoutHandle;
  clearTimer?: (timer: TimeoutHandle) => void;
}) {
  let stopping = false;
  const forceAfterMs = options.forceAfterMs ?? 10_000;
  const setTimer = options.setTimer ?? ((handler, timeoutMs) => setTimeout(handler, timeoutMs));
  const clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));

  return (signal: string) => {
    if (stopping) return;
    stopping = true;
    options.logger.info('api.shutdown_started', { signal });
    const timer = setTimer(() => {
      options.logger.error('api.shutdown_timeout', { signal, forceAfterMs });
      options.exit(1);
    }, forceAfterMs);
    timer.unref?.();

    const closeServer = () => options.server.close((error) => {
      clearTimer(timer);
      if (error) {
        options.logger.error('api.shutdown_failed', { signal, error: error.message });
        options.exit(1);
        return;
      }
      options.logger.info('api.shutdown_completed', { signal });
      options.exit(0);
    });

    try {
      const cleanup = options.beforeClose?.();
      if (cleanup && typeof cleanup.then === 'function') {
        void cleanup.then(closeServer, (error: unknown) => {
          options.logger.warn('api.shutdown_cleanup_failed', {
            signal,
            error: error instanceof Error ? error.message : String(error),
          });
          closeServer();
        });
      } else {
        closeServer();
      }
    } catch (error) {
      options.logger.warn('api.shutdown_cleanup_failed', {
        signal,
        error: error instanceof Error ? error.message : String(error),
      });
      closeServer();
    }
  };
}
