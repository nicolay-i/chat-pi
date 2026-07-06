import { serve } from '@hono/node-server';
import { createApp } from './server';
import { config } from './config';
import { getDb } from './db';

const app = createApp(getDb());

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Pi Agents API listening on http://localhost:${info.port}`);
});
