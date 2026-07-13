import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { RPCHandler } from '@orpc/server/fetch';
import type { DatabaseSync } from 'node:sqlite';
import { ApiErrorSchema } from '@pi-agents/contracts';
import { config, type Config } from './config';
import { createServiceContainer, type CreateAppOptions as CreateServiceContainerOptions } from './app/serviceContainer';
import { createHealthRoutes, healthRouteOperationIds } from './routes/healthRoutes';
import { createProjectRoutes, projectRouteOperationIds } from './routes/projectRoutes';
import { createChatRoutes, chatRouteOperationIds } from './routes/chatRoutes';
import { createTaskRoutes, taskRouteOperationIds } from './routes/taskRoutes';
import { createRealtimeRoutes, realtimeRouteOperationIds } from './routes/realtimeRoutes';
import { createFileRoutes, fileRouteOperationIds } from './routes/fileRoutes';
import { createActionRoutes, actionRouteOperationIds } from './routes/actionRoutes';
import { createProviderRoutes, providerRouteOperationIds } from './routes/providerRoutes';
import { createSkillRoutes, skillRouteOperationIds } from './routes/skillRoutes';
import { createPromptRoutes, promptRouteOperationIds } from './routes/promptRoutes';
import { createMcpRoutes, mcpRouteOperationIds } from './routes/mcpRoutes';
import { createThemeRoutes, themeRouteOperationIds } from './routes/themeRoutes';
import { providerRpcRouter } from './orpc/providerRouter';
import { createWebClientMiddleware } from './webClient';

export type CreateAppOptions = CreateServiceContainerOptions & {
  corsPolicy?: Pick<Config, 'nodeEnv' | 'corsOrigins'> & Partial<Pick<Config, 'trustProxy'>>;
  maxBodyBytes?: number;
  webRoot?: string;
};

export const registeredApiOperationIds = [
  ...healthRouteOperationIds,
  ...projectRouteOperationIds,
  ...chatRouteOperationIds,
  ...taskRouteOperationIds,
  ...realtimeRouteOperationIds,
  ...fileRouteOperationIds,
  ...actionRouteOperationIds,
  ...providerRouteOperationIds,
  ...skillRouteOperationIds,
  ...promptRouteOperationIds,
  ...mcpRouteOperationIds,
  ...themeRouteOperationIds,
] as const;

export function createCorsMiddleware(policy: Pick<Config, 'nodeEnv' | 'corsOrigins'>) {
  const isDevelopment = policy.nodeEnv !== 'production';
  return cors({
    origin: isDevelopment
      ? '*'
      : (origin) => policy.corsOrigins.includes(origin) ? origin : undefined,
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', 'authorization'],
    maxAge: 600,
  });
}

export type AppWithLifecycle = Hono & { dispose(): Promise<void> };

export function createApp(db: DatabaseSync, options: CreateAppOptions = {}): AppWithLifecycle {
  const app = new Hono() as AppWithLifecycle;
  const services = createServiceContainer(db, options);
  const providerRpcHandler = new RPCHandler(providerRpcRouter);
  const corsPolicy = options.corsPolicy ?? config;
  app.use('*', createCorsMiddleware(corsPolicy));
  app.use('/api/*', bodyLimit({
    maxSize: options.maxBodyBytes ?? config.maxBodyBytes,
    onError: (context) => context.json(ApiErrorSchema.parse({
      code: 'payload_too_large',
      message: 'Request body exceeds the configured limit',
      retryable: false,
    }), 413),
  }));
  app.use('/rpc/*', async (context, next) => {
    const { matched, response } = await providerRpcHandler.handle(context.req.raw, {
      prefix: '/rpc',
      context: { providerService: services.providerService },
    });
    if (matched) return context.newResponse(response.body, response);
    await next();
  });
  app.route('/', createHealthRoutes());
  app.route('/', createProjectRoutes(services));
  app.route('/', createChatRoutes(services));
  app.route('/', createTaskRoutes(services));
  app.route('/', createRealtimeRoutes(services));
  app.route('/', createFileRoutes(services));
  app.route('/', createActionRoutes(services));
  app.route('/', createProviderRoutes(services));
  app.route('/', createSkillRoutes(services));
  app.route('/', createPromptRoutes(services));
  app.route('/', createMcpRoutes(services));
  app.route('/', createThemeRoutes(services));
  app.use('*', createWebClientMiddleware(options.webRoot ?? config.webRoot));
  if (corsPolicy.nodeEnv !== 'production') app.get('/__throws', () => { throw new Error('boom'); });
  app.onError((error, context) => context.json(ApiErrorSchema.parse({
    code: 'internal_error', message: error.message, retryable: false,
  }), 500));
  app.dispose = services.dispose;
  return app;
}

export type AppType = ReturnType<typeof createApp>;
