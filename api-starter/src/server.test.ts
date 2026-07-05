import { describe, it, expect } from 'vitest';
import { app } from './server';
import { CapabilitiesSchema } from '@pi-agents/contracts';

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
  it('returns a parsed project list', async () => {
    const res = await app.request('/api/projects');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe('project-demo');
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
