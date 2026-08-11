import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { MiddlewareHandler } from 'hono';
import { ApiErrorSchema } from '@pi-agents/contracts';

function normalizeToken(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

export function resolveAuthToken(options: { explicit?: string; filePath?: string } = {}): string | undefined {
  const explicit = normalizeToken(options.explicit);
  if (explicit) return explicit;
  const filePath = options.filePath?.trim();
  if (!filePath) return undefined;
  let value: string;
  try {
    value = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read PI_AUTH_TOKEN_FILE: ${error instanceof Error ? error.message : String(error)}`);
  }
  const token = normalizeToken(value);
  if (!token) throw new Error('PI_AUTH_TOKEN_FILE is empty');
  return token;
}

function matchesToken(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function createBearerAuthMiddleware(token: string | undefined): MiddlewareHandler {
  if (!token) return async (_context, next) => next();
  return async (context, next) => {
    // CORS preflight and the public discovery endpoints must remain reachable
    // before the client has entered a credential.
    const path = context.req.path;
    if (!path.startsWith('/api/') && !path.startsWith('/rpc/')) {
      await next();
      return;
    }
    if (context.req.method === 'OPTIONS' || path === '/api/capabilities') {
      await next();
      return;
    }
    const header = context.req.header('authorization');
    const actual = header?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!matchesToken(actual, token)) {
      return context.json(ApiErrorSchema.parse({
        code: 'unauthorized',
        message: 'Bearer token is required for this server',
        retryable: false,
      }), 401);
    }
    await next();
  };
}
