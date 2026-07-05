import { serve } from '@hono/node-server';
import { app } from './server';
import { config } from './config';

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Pi Agents API listening on http://localhost:${info.port}`);
});
