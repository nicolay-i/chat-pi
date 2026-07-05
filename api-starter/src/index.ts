import { serve } from '@hono/node-server';
import { app } from './server';

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Pi Agents API listening on http://localhost:${info.port}`);
});
