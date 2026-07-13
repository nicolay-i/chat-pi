import type { PiSandboxMode } from './services/piSandbox';

function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(`Invalid PORT env var: ${value}`);
  }
  return n;
}

function parseHost(value: string | undefined): string {
  const host = value?.trim();
  if (!host) return '127.0.0.1';
  if (host.includes('://') || /[\\/\s]/.test(host)) {
    throw new Error(`Invalid API_HOST env var: ${value}`);
  }
  return host;
}

function parseByteLimit(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n < 1 || n > 100 * 1024 * 1024) {
    throw new Error(`Invalid MAX_BODY_BYTES env var: ${value}`);
  }
  return n;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string, max: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(n) || n < 1 || n > max) {
    throw new Error(`Invalid ${name} env var: ${value}`);
  }
  return n;
}

function parseBoolean(value: string | undefined, fallback: boolean, name: string): boolean {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`Invalid ${name} env var: ${value}`);
}

function optionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function parseCsv(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}

function parseCorsOrigins(value: string | undefined): string[] {
  if (value === undefined || value.trim() === '') return [];

  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  const normalized = origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS_ORIGINS entry: ${origin}`);
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`CORS_ORIGINS entry must use http or https: ${origin}`);
    }
    if (url.pathname !== '/' || url.search || url.hash) {
      throw new Error(`CORS_ORIGINS entry must be an origin without a path: ${origin}`);
    }
    return url.origin;
  });

  return [...new Set(normalized)];
}

export type Config = {
  port: number;
  host: string;
  nodeEnv: string;
  logLevel: string;
  agentRuntime: 'fake' | 'pi';
  agentCwd: string | undefined;
  piBin: string | undefined;
  piNode: string | undefined;
  piProvider: string | undefined;
  piModel: string | undefined;
  piAgentDir: string | undefined;
  piSandboxMode: PiSandboxMode;
  piSandboxBin: string | undefined;
  piSandboxEnvAllowlist: string[];
  piRunTimeoutMs: number;
  piProjectsRoot: string | undefined;
  webRoot: string | undefined;
  corsOrigins: string[];
  maxBodyBytes: number;
  packageResolveRateLimit: number;
  packageResolveRateWindowMs: number;
  trustProxy: boolean;
  diskWarningFreeBytes: number;
  diskCheckIntervalMs: number;
};

function parseAgentRuntime(value: string | undefined): 'fake' | 'pi' {
  if (value === undefined || value === '') return 'fake';
  if (value === 'fake' || value === 'pi') return value;
  throw new Error(`Invalid AGENT_RUNTIME env var: ${value}`);
}

function parsePiSandboxMode(value: string | undefined): PiSandboxMode {
  if (value === undefined || value === '') return 'none';
  if (value === 'none' || value === 'bwrap') return value;
  throw new Error(`Invalid PI_SANDBOX_MODE env var: ${value}`);
}

export function createConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const corsOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  if (nodeEnv === 'production' && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be set when NODE_ENV=production');
  }

  return {
    port: parsePort(env.PORT, 8787),
    host: parseHost(env.API_HOST),
    nodeEnv,
    logLevel: env.LOG_LEVEL ?? 'info',
    agentRuntime: parseAgentRuntime(env.AGENT_RUNTIME ?? env.PI_MODE),
    agentCwd: optionalString(env.PI_CWD),
    piBin: optionalString(env.PI_BIN),
    piNode: optionalString(env.PI_NODE),
    piProvider: optionalString(env.PI_PROVIDER),
    piModel: optionalString(env.PI_MODEL),
    piAgentDir: optionalString(env.PI_AGENT_DIR),
    piSandboxMode: parsePiSandboxMode(env.PI_SANDBOX_MODE),
    piSandboxBin: optionalString(env.PI_SANDBOX_BIN),
    piSandboxEnvAllowlist: parseCsv(env.PI_SANDBOX_ENV_ALLOWLIST),
    piRunTimeoutMs: parsePositiveInteger(env.PI_RUN_TIMEOUT_SECONDS, 1_200, 'PI_RUN_TIMEOUT_SECONDS', 86_400) * 1_000,
    piProjectsRoot: optionalString(env.PI_PROJECTS_ROOT),
    webRoot: optionalString(env.WEB_ROOT),
    corsOrigins,
    maxBodyBytes: parseByteLimit(env.MAX_BODY_BYTES, 1024 * 1024),
    packageResolveRateLimit: parsePositiveInteger(env.PACKAGE_RESOLVE_RATE_LIMIT, 10, 'PACKAGE_RESOLVE_RATE_LIMIT', 10_000),
    packageResolveRateWindowMs: parsePositiveInteger(env.PACKAGE_RESOLVE_RATE_WINDOW_SECONDS, 60, 'PACKAGE_RESOLVE_RATE_WINDOW_SECONDS', 3_600) * 1000,
    trustProxy: parseBoolean(env.TRUST_PROXY, false, 'TRUST_PROXY'),
    diskWarningFreeBytes: parsePositiveInteger(env.DISK_WARNING_FREE_BYTES, 1024 * 1024 * 1024, 'DISK_WARNING_FREE_BYTES', Number.MAX_SAFE_INTEGER),
    diskCheckIntervalMs: parsePositiveInteger(env.DISK_CHECK_INTERVAL_SECONDS, 300, 'DISK_CHECK_INTERVAL_SECONDS', 86_400) * 1000,
  };
}

export const config = createConfig();
