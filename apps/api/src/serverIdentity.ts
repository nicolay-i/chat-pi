import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function valid(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && UUID_PATTERN.test(normalized) ? normalized : undefined;
}

/**
 * Resolve the identity of one backend node. A persistent file is preferred in
 * production so a restart does not make the same computer look like a new
 * server. Tests and ephemeral app instances may intentionally use a generated
 * identity by omitting both inputs.
 */
export function resolveServerId(options: { explicit?: string; filePath?: string } = {}): string {
  const explicit = valid(options.explicit);
  if (explicit) return explicit;

  const filePath = options.filePath?.trim();
  if (filePath) {
    try {
      if (existsSync(filePath)) {
        const stored = valid(readFileSync(filePath, 'utf8'));
        if (stored) return stored;
      }
      const generated = crypto.randomUUID();
      mkdirSync(dirname(filePath), { recursive: true });
      try {
        writeFileSync(filePath, `${generated}\n`, { encoding: 'utf8', flag: 'wx' });
        return generated;
      } catch {
        const raced = valid(readFileSync(filePath, 'utf8'));
        if (raced) return raced;
      }
    } catch {
      // A read-only or unavailable state directory should not prevent the API
      // from starting. The identity remains stable for this process.
    }
  }
  return crypto.randomUUID();
}
