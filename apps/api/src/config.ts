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
  agentRuntime: 'fake' | 'pi';
  agentCwd: string | undefined;
  piBin: string | undefined;
  piNode: string | undefined;
  piProvider: string | undefined;
  piModel: string | undefined;
};

function parseAgentRuntime(value: string | undefined): 'fake' | 'pi' {
  if (value === undefined || value === '') return 'fake';
  if (value === 'fake' || value === 'pi') return value;
  throw new Error(`Invalid AGENT_RUNTIME env var: ${value}`);
}

export const config: Config = {
  port: parsePort(process.env.PORT, 8787),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  agentRuntime: parseAgentRuntime(process.env.AGENT_RUNTIME ?? process.env.PI_MODE),
  agentCwd: process.env.PI_CWD,
  piBin: process.env.PI_BIN,
  piNode: process.env.PI_NODE,
  piProvider: process.env.PI_PROVIDER,
  piModel: process.env.PI_MODEL,
};
