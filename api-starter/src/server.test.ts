import { describe, it, expect } from 'vitest';
import { createApp } from './server';
import { createDb } from './db';
import { CreateProjectInputSchema, CapabilitiesSchema } from '@pi-agents/contracts';

const app = createApp(createDb(':memory:'));

describe('GET /health', () => {
  it('returns ok status', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true });
    expect(typeof body.time).toBe('string');
  });
});

describe('GET /api/capabilities', () => {
  it('returns capability flags', async () => {
    const res = await app.request('/api/capabilities');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.supportsWorktrees).toBe(true);
    expect(body.supportsSse).toBe(true);
  });

  it('matches the Capabilities contract', async () => {
    const res = await app.request('/api/capabilities');
    const body = await res.json();
    expect(() => CapabilitiesSchema.parse(body)).not.toThrow();
  });
});

describe('GET /api/projects', () => {
  it('returns an empty array when db is fresh', async () => {
    const res = await app.request('/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});

describe('POST /api/projects', () => {
  it('creates a project and returns 201', async () => {
    const input = CreateProjectInputSchema.parse({
      name: 'demo',
      repoPath: '/repos/demo',
      defaultBranch: 'main',
    });
    const res = await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('demo');
  });
});

describe('app.onError', () => {
  it('returns an ApiError-shaped response when a route throws', async () => {
    const res = await app.request('/__throws');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({
      code: 'internal_error',
      message: 'boom',
      retryable: false,
    });
    expect(typeof body.code).toBe('string');
    expect(typeof body.message).toBe('string');
  });
});
