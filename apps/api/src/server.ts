import { Hono, type Context, type MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { RPCHandler } from '@orpc/server/fetch';
import type { DatabaseSync } from 'node:sqlite';
import { ApiErrorSchema } from '@pi-agents/contracts';
import { config, type Config } from './config';
import { FixedWindowRateLimiter } from './app/rateLimiter';
import { createServiceContainer, type CreateAppOptions as CreateServiceContainerOptions } from './app/serviceContainer';
import { createHealthRoutes, healthRouteOperationIds } from './routes/healthRoutes';
import { createProjectRoutes, projectRouteOperationIds } from './routes/projectRoutes';
import { createChatRoutes, chatRouteOperationIds } from './routes/chatRoutes';
import { createTaskRoutes, taskRouteOperationIds } from './routes/taskRoutes';
import { createRealtimeRoutes, realtimeRouteOperationIds } from './routes/realtimeRoutes';
import { createFileRoutes, fileRouteOperationIds } from './routes/fileRoutes';
import { createActionRoutes, actionRouteOperationIds } from './routes/actionRoutes';
import { createProviderRoutes, providerRouteOperationIds } from './routes/providerRoutes';
import { createPackageRoutes, packageRouteOperationIds } from './routes/packageRoutes';
import { createSkillRoutes, skillRouteOperationIds } from './routes/skillRoutes';
import { createPromptRoutes, promptRouteOperationIds } from './routes/promptRoutes';
import { createMcpRoutes, mcpRouteOperationIds } from './routes/mcpRoutes';
import { createThemeRoutes, themeRouteOperationIds } from './routes/themeRoutes';
import { providerRpcRouter } from './orpc/providerRouter';
import { createWebClientMiddleware } from './webClient';

export type CreateAppOptions = CreateServiceContainerOptions & {
  corsPolicy?: Pick<Config, 'nodeEnv' | 'corsOrigins'> & Partial<Pick<Config, 'trustProxy'>>;
  maxBodyBytes?: number;
  packageResolveRateLimit?: Pick<Config, 'packageResolveRateLimit' | 'packageResolveRateWindowMs'>;
  rateLimiter?: FixedWindowRateLimiter;
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
  ...packageRouteOperationIds,
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

function requestClientKey(context: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = context.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return `ip:${forwarded}`;
  }

  const incoming = (context.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ? `ip:${incoming.socket.remoteAddress}` : 'shared:unknown-client';
}

export function createPackageResolveRateLimitMiddleware(
  limiter: FixedWindowRateLimiter,
  trustProxy: boolean,
): MiddlewareHandler {
  return async (context, next) => {
    if (context.req.method !== 'POST' || !/^\/api\/projects\/[^/]+\/packages\/resolve$/.test(new URL(context.req.url).pathname)) {
      return next();
    }

    const result = limiter.consume(requestClientKey(context, trustProxy));
    if (result.allowed) return next();
    context.header('Retry-After', String(result.retryAfterSeconds));
    return context.json(ApiErrorSchema.parse({
      code: 'rate_limited',
      message: 'Too many package resolution requests. Try again later.',
      retryable: true,
    }), 429);
  };
}

export type AppWithLifecycle = Hono & { dispose(): Promise<void> };

export function createApp(db: DatabaseSync, options: CreateAppOptions = {}): AppWithLifecycle {
  const app = new Hono() as AppWithLifecycle;
  const services = createServiceContainer(db, options);
  const providerRpcHandler = new RPCHandler(providerRpcRouter);
  const corsPolicy = options.corsPolicy ?? config;
  const rateLimitPolicy = options.packageResolveRateLimit ?? config;
  const rateLimiter = options.rateLimiter ?? new FixedWindowRateLimiter(
    rateLimitPolicy.packageResolveRateLimit,
    rateLimitPolicy.packageResolveRateWindowMs,
  );
  app.use('*', createCorsMiddleware(corsPolicy));
  app.use('/api/*', bodyLimit({
    maxSize: options.maxBodyBytes ?? config.maxBodyBytes,
    onError: (context) => context.json(ApiErrorSchema.parse({
      code: 'payload_too_large',
      message: 'Request body exceeds the configured limit',
      retryable: false,
    }), 413),
  }));
  app.use('/api/*', createPackageResolveRateLimitMiddleware(rateLimiter, corsPolicy.trustProxy ?? config.trustProxy));
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
  app.route('/', createPackageRoutes(services));
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
