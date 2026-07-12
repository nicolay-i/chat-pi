import { serve } from '@hono/node-server';
import { dirname } from 'node:path';
import { statfsSync } from 'node:fs';
import { createApp } from './server';
import { config } from './config';
import { DEFAULT_DB_PATH, getDb } from './db';
import { createGracefulShutdown, createJsonLogger } from './app/lifecycle';

const app = createApp(getDb());
const logger = createJsonLogger();
const dbDirectory = dirname(process.env.DB_PATH ?? DEFAULT_DB_PATH);

function reportDiskSpace(): void {
  try {
    const stats = statfsSync(dbDirectory);
    const freeBytes = Number(stats.bavail) * Number(stats.bsize);
    const fields = { path: dbDirectory, freeBytes, warningThresholdBytes: config.diskWarningFreeBytes };
    if (freeBytes <= config.diskWarningFreeBytes) logger.warn('api.disk_low', fields);
    else logger.info('api.disk_ok', fields);
  } catch (error) {
    logger.error('api.disk_check_failed', { path: dbDirectory, error: error instanceof Error ? error.message : String(error) });
  }
}

const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  logger.info('api.started', { host: config.host, port: info.port, runtime: config.agentRuntime });
});
server.on('error', (error) => logger.error('api.server_error', { error: error.message }));
reportDiskSpace();
const diskTimer = setInterval(reportDiskSpace, config.diskCheckIntervalMs);
diskTimer.unref();

const shutdown = createGracefulShutdown({
  server,
  logger,
  exit: (code) => process.exit(code),
  beforeClose: async () => {
    clearInterval(diskTimer);
    await app.dispose();
  },
});
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
