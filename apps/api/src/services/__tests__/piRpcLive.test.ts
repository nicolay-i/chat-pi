import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { PiRpcClient } from '../piRpcClient';

const LIVE = !!process.env.PI_LIVE;

describe.skipIf(!LIVE)('pi rpc live', () => {
  it('runs a prompt turn through the real pi CLI and streams events', async () => {
    // pi rpc requires a git-repo cwd to actually generate (an empty/non-git
    // cwd yields an immediate empty turn). The real app runs pi inside task
    // worktrees, which are git repos — so mirror that here.
    const cwd = mkdtempSync(join(tmpdir(), 'pi-rpc-'));
    try {
      execSync('git init -q', { cwd });
    } catch {
      /* git unavailable — proceed; the run may produce an empty turn */
    }
    const client = new PiRpcClient({
      piBin: process.platform === 'win32' ? 'pi.cmd' : 'pi',
      cwd,
    });

    const events: Record<string, unknown>[] = [];
    const unsubscribe = client.onEvent((e) => events.push(e));

    try {
      await client.start();
    } catch (err) {
      // Resilience: if pi can't be spawned in this environment, skip rather
      // than fail — the live test is opt-in and shouldn't hard-fail on a
      // missing binary.
      unsubscribe();
      console.warn(`pi rpc live: spawn failed, skipping. ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    try {
      await client.prompt('reply with exactly: ok');
      // Observed nvidia/minimax-m3 turn latency ranges ~25-55s; allow headroom.
      await client.waitForIdle(90_000);

      const updateEvents = events.filter((e) => e.type === 'message_update');
      const sawAgentEnd = events.some((e) => e.type === 'agent_end');

      const assistantText = events
        .filter(
          (e) =>
            e.type === 'message_update' &&
            typeof e.assistantMessageEvent === 'object' &&
            e.assistantMessageEvent !== null &&
            (e.assistantMessageEvent as Record<string, unknown>).type === 'text_delta',
        )
        .map(
          (e) => (e.assistantMessageEvent as Record<string, unknown>).delta as string,
        )
        .join('');

      expect(updateEvents.length).toBeGreaterThan(0);
      expect(sawAgentEnd).toBe(true);
      expect(assistantText.toLowerCase()).toContain('ok');
    } finally {
      unsubscribe();
      await client.stop();
    }
  }, 120_000);
});
