import { describe, expect, it } from 'vitest';
import { createConfig } from './config';

describe('createConfig', () => {
  it('keeps local development permissive when no CORS origins are configured', () => {
    expect(createConfig({ NODE_ENV: 'development' }).corsOrigins).toEqual([]);
  });

  it('requires an explicit CORS allowlist in production', () => {
    expect(() => createConfig({ NODE_ENV: 'production' })).toThrow('CORS_ORIGINS');
  });

  it('normalizes and deduplicates configured origins', () => {
    const config = createConfig({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://chat.tailnet.ts.net/, http://100.116.45.50:8092, https://chat.tailnet.ts.net',
    });

    expect(config.corsOrigins).toEqual(['https://chat.tailnet.ts.net', 'http://100.116.45.50:8092']);
  });

  it('rejects paths and non-HTTP origins', () => {
    expect(() => createConfig({ CORS_ORIGINS: 'https://example.com/app' })).toThrow('without a path');
    expect(() => createConfig({ CORS_ORIGINS: 'file:///app' })).toThrow('http or https');
  });

  it('accepts only supported Pi sandbox modes', () => {
    expect(createConfig({ PI_SANDBOX_MODE: 'bwrap' }).piSandboxMode).toBe('bwrap');
    expect(() => createConfig({ PI_SANDBOX_MODE: 'container' })).toThrow('PI_SANDBOX_MODE');
  });

  it('accepts a bounded request-body limit', () => {
    expect(createConfig({ MAX_BODY_BYTES: '2048' }).maxBodyBytes).toBe(2048);
    expect(() => createConfig({ MAX_BODY_BYTES: '0' })).toThrow('MAX_BODY_BYTES');
  });

  it('binds standalone API to loopback unless an explicit host is configured', () => {
    expect(createConfig({}).host).toBe('127.0.0.1');
    expect(createConfig({ API_HOST: '100.116.45.50' }).host).toBe('100.116.45.50');
    expect(() => createConfig({ API_HOST: 'http://example.test' })).toThrow('API_HOST');
  });

  it('parses proxy trust explicitly', () => {
    const config = createConfig({
      TRUST_PROXY: 'true',
    });

    expect(config.trustProxy).toBe(true);
    expect(() => createConfig({ TRUST_PROXY: 'yes' })).toThrow('TRUST_PROXY');
  });

  it('parses bounded disk-monitoring settings', () => {
    const config = createConfig({ DISK_WARNING_FREE_BYTES: '4096', DISK_CHECK_INTERVAL_SECONDS: '15' });

    expect(config.diskWarningFreeBytes).toBe(4096);
    expect(config.diskCheckIntervalMs).toBe(15_000);
    expect(() => createConfig({ DISK_CHECK_INTERVAL_SECONDS: '0' })).toThrow('DISK_CHECK_INTERVAL_SECONDS');
  });

  it('treats blank Pi settings as absent so runtime defaults remain available', () => {
    const config = createConfig({
      PI_CWD: '  ', PI_BIN: '', PI_NODE: ' ', PI_PROVIDER: '', PI_MODEL: '  ', PI_AGENT_DIR: '', PI_PROJECTS_ROOT: ' ',
    });

    expect(config.agentCwd).toBeUndefined();
    expect(config.piBin).toBeUndefined();
    expect(config.piNode).toBeUndefined();
    expect(config.piProvider).toBeUndefined();
    expect(config.piModel).toBeUndefined();
    expect(config.piAgentDir).toBeUndefined();
    expect(config.piProjectsRoot).toBeUndefined();
  });

  it('keeps an explicit container project root for worktree isolation', () => {
    expect(createConfig({ PI_PROJECTS_ROOT: '/projects' }).piProjectsRoot).toBe('/projects');
  });
});
