# Acceptance Matrix

This matrix maps the normative scenarios in `plans/2.md` to current automated
evidence. A green local suite does not replace an explicitly external gate.

| Criterion | Current evidence | Status |
| --- | --- | --- |
| 14.1 One Chat, sequential Tasks | `apps/api/src/server.test.ts` test `implementation milestone over public API` creates two Tasks in one Chat after a merge and verifies the same PiSession, a new clean worktree and changed cwd. | Covered locally |
| 14.2 Checkpoint for every step | `apps/api/src/server.test.ts` test `accepts a second user step as soon as the first task run becomes reviewable` sends two normal messages. It asserts a no-change checkpoint, a changed-file checkpoint, distinct SHA values and distinct native Pi JSONL entries. | Covered locally |
| 14.3 Abort without losing files | `apps/api/src/server.test.ts` test `preserves a dirty worktree after abort and recovers it on the next user step` changes a real worktree, verifies its diff and file after Abort, then verifies recovery context and explicit discard. | Covered locally |
| 14.4 Rollback in the same Chat | `apps/api/src/services/__tests__/gitFlows.test.ts` test `rollback preserves the Chat PiSession while creating an isolated worktree from its checkpoint` verifies the same logical PiSession, a branch JSONL file at the checkpoint leaf and an independent worktree. | Covered locally |
| 14.5 Fork into a new Chat | `apps/api/src/server.test.ts` test `uses the task worktree/session and publishes run events to chat SSE` and `gitFlows.test.ts` test `fork creates a new branch + worktree from the checkpoint sha` verify a different Chat/PiSession, copied ancestry only through the selected entry and isolated Git state. | Covered locally |
| 14.6 Explicit remote sync | `apps/api/src/services/__tests__/gitFlows.test.ts` test `updates the primary repository only after an explicit project remote-sync apply` verifies no background update, explicit fast-forward and stale marking. | Covered locally |
| 14.7 Restart with paused queue | `apps/api/src/services/__tests__/integrationHarness.test.ts` and `piRuntime.test.ts` cover interrupted status, released locks, retained queued follow-ups and recovery context before a new Run. | Covered locally |
| 14.8 Orchestration | `apps/api/src/server.test.ts` describe block `orchestration chat API` verifies isolated implementation Chats/Tasks, distinct sessions and worktrees, while the orchestration Chat has no writable Task. | Covered locally |

## External gates

- Run the real provider-backed bwrap verification on the selected Linux VPS:
  `docker compose exec -T -e VERIFY_PROJECT_REPO_PATH=/projects/my-repository api pnpm --filter @pi-agents/api verify:vps-bwrap`.
- Exercise the Android and iOS clients on devices.
- Verify the configured Ignis host can edit the VPS Markdown vault after a Task.

See `docs/TESTING-GAPS.md` for the full boundary inventory.
