import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveServerId } from './serverIdentity';
import { describe, expect, it } from 'vitest';

describe('resolveServerId', () => {
  it('keeps a generated node id across restarts', () => {
    const root = mkdtempSync(join(tmpdir(), 'pi-agents-server-id-'));
    try {
      const filePath = join(root, 'state', 'server-id');
      const first = resolveServerId({ filePath });
      const second = resolveServerId({ filePath });
      expect(first).toBe(second);
      expect(readFileSync(filePath, 'utf8').trim()).toBe(first);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('prefers a valid explicit id', () => {
    const explicit = '11111111-1111-4111-8111-111111111111';
    expect(resolveServerId({ explicit, filePath: join(tmpdir(), 'not-used-server-id') })).toBe(explicit);
  });

  it('falls back to a UUID when the configured state file is unavailable', () => {
    const id = resolveServerId({ filePath: join('Z:', 'definitely-missing', 'server-id') });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
