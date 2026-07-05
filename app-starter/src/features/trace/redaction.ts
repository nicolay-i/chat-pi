const SECRET_KEY_FRAGMENTS = [
  'secret',
  'password',
  'token',
  'apikey',
  'api_key',
  'authorization',
  'bearer',
  'privatekey',
  'private_key',
  'session',
  'cookie',
] as const;

const SECRET_VALUE_REGEX = /(sk|pk|AKIA|ghp|gho|glpat)-[A-Za-z0-9-]{8,}/g;

export const REDACTED = '<redacted>';

export function hasSecretKey(path: string): boolean {
  const lower = path.toLowerCase();
  return SECRET_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactString(value: string): string {
  return value.replace(SECRET_VALUE_REGEX, REDACTED);
}

export function redactSecrets(payload: unknown): unknown {
  if (payload === null || payload === undefined) {
    return payload;
  }
  if (typeof payload === 'string') {
    return redactString(payload);
  }
  if (typeof payload === 'number' || typeof payload === 'boolean') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map((item) => redactSecrets(item));
  }
  if (isRecord(payload)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(payload)) {
      if (hasSecretKey(key)) {
        out[key] = REDACTED;
      } else {
        out[key] = redactSecrets(payload[key]);
      }
    }
    return out;
  }
  return payload;
}
