import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { MiddlewareHandler } from 'hono';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function extension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '' : path.slice(dot).toLowerCase();
}

function isWithinRoot(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}${sep}`);
}

function existingFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function cacheControl(path: string): string {
  return path.includes(`${sep}_expo${sep}`)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
}

/**
 * Serves an exported Expo Web bundle after the API routes. The explicit root
 * prevents an accidentally configured path from exposing arbitrary host files.
 */
export function createWebClientMiddleware(webRoot: string | undefined): MiddlewareHandler {
  if (!webRoot) return async (_context, next) => next();

  const root = resolve(webRoot);
  const indexPath = resolve(root, 'index.html');

  return async (context, next) => {
    if (context.req.method !== 'GET' && context.req.method !== 'HEAD') return next();

    const pathname = new URL(context.req.url).pathname;
    if (pathname === '/health' || pathname === '/api' || pathname.startsWith('/api/') || pathname === '/rpc' || pathname.startsWith('/rpc/')) {
      return next();
    }

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(pathname);
    } catch {
      return next();
    }

    const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
    let filePath = resolve(root, relativePath);
    if (!isWithinRoot(root, filePath) || !existingFile(filePath)) {
      const acceptsHtml = context.req.header('accept')?.includes('text/html') ?? false;
      if (!acceptsHtml || !existingFile(indexPath)) return next();
      filePath = indexPath;
    }

    const headers = new Headers({
      'cache-control': cacheControl(filePath),
      'content-type': MIME_TYPES[extension(filePath)] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    return new Response(
      context.req.method === 'HEAD' ? null : readFileSync(filePath),
      { headers },
    );
  };
}
