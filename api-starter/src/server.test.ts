import { describe, it, expect } from 'vitest';
import { app } from './server';

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
