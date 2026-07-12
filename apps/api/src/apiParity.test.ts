import { describe, expect, it } from 'vitest';
import {
  apiClientOperationIds,
  apiOperationById,
  apiOperations,
  implementedApiOperationIds,
} from '@pi-agents/contracts';
import { registeredApiOperationIds } from './server';
import { ApiClient } from '../../mobile/src/api/client';
import { createDb } from './db';
import { createApp } from './server';

function normalizePath(path: string): string {
  return path.replace(/:[^/]+/g, ':param');
}

describe('API registry parity', () => {
  it('gives every public ApiClient operation a typed operation descriptor', () => {
    expect(ApiClient.operationIds).toEqual(apiClientOperationIds);
    expect(new Set(apiClientOperationIds).size).toBe(apiClientOperationIds.length);
    for (const id of apiClientOperationIds) {
      const operation = apiOperationById.get(id);
      expect(operation, id).toBeDefined();
      expect(operation?.responseSchema, id).toBeDefined();
    }
  });

  it('keeps registered Hono operations in sync with implemented descriptors', () => {
    expect(new Set(registeredApiOperationIds)).toEqual(new Set(implementedApiOperationIds));
    for (const id of registeredApiOperationIds) {
      const operation = apiOperationById.get(id);
      expect(operation, id).toMatchObject({ implemented: true });
    }
  });

  it('keeps every registry method and path backed by the assembled Hono app', () => {
    const app = createApp(createDb(':memory:'));
    const routes = new Set(
      app.routes.map((route) => `${route.method.toUpperCase()} ${normalizePath(route.path)}`),
    );

    for (const operation of apiOperations.filter((item) => item.implemented)) {
      expect(routes, operation.id).toContain(`${operation.method} ${normalizePath(operation.path)}`);
    }
  });

  it('uses unique operation IDs and valid HTTP paths', () => {
    expect(new Set(apiOperations.map((operation) => operation.id)).size).toBe(apiOperations.length);
    for (const operation of apiOperations) {
      expect(operation.path, operation.id).toMatch(/^\//);
      expect(typeof operation.responseSchema.safeParse).toBe('function');
    }
  });
});
