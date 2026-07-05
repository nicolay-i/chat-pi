function parsePort(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < 0 || n > 65535) {
    throw new Error(`Invalid PORT env var: ${value}`);
  }
  return n;
}

export type Config = {
  port: number;
  nodeEnv: string;
  logLevel: string;
};

export const config: Config = {
  port: parsePort(process.env.PORT, 8787),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
