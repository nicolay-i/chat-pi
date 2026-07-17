# Acceptance Matrix

This matrix maps the normative scenarios in `plans/2.md` to current automated
evidence. A green local suite does not replace an explicitly external gate.

| Criterion | Current evidence | Status |
| --- | --- | --- |
| 14.1 One Chat, sequential Tasks | `apps/api/src/server.test.ts` test `implementation milestone over public API` creates a second Task in one Chat after a merge and verifies the same PiSession, a new clean worktree and changed cwd. The Chat UI now exposes this operation when no Task is active; a real 390x844 Chromium pass created the next Task, refreshed `activeTaskId`, retained the Chat/PiSession and verified the new clean worktree. | Covered locally + UI verified |
| 14.2 Checkpoint for every step | `apps/api/src/server.test.ts` test `accepts a second user step as soon as the first task run becomes reviewable` sends two normal messages. It asserts a no-change checkpoint, a changed-file checkpoint, distinct SHA values and distinct native Pi JSONL entries. | Covered locally |
| 14.3 Abort without losing files | `apps/api/src/server.test.ts` test `preserves a dirty worktree after abort and recovers it on the next user step` changes a real worktree, verifies its diff and file after Abort, then verifies recovery context and explicit discard. | Covered locally |
| 14.4 Rollback in the same Chat | `apps/api/src/services/__tests__/gitFlows.test.ts` test `rollback preserves the Chat PiSession while creating an isolated worktree from its checkpoint` verifies the same logical PiSession, a branch JSONL file at the checkpoint leaf and an independent worktree. | Covered locally |
| 14.5 Fork into a new Chat | `apps/api/src/server.test.ts` test `uses the task worktree/session and publishes run events to chat SSE` and `gitFlows.test.ts` test `fork creates a new branch + worktree from the checkpoint sha` verify a different Chat/PiSession, copied ancestry only through the selected entry and isolated Git state. | Covered locally |
| 14.6 Explicit remote sync | `apps/api/src/services/__tests__/gitFlows.test.ts` verifies no background update, explicit fast-forward and stale marking. Project Settings now exposes inspect plus separately confirmed apply; a real local Chromium pass proved inspect leaves HEAD unchanged and confirmed apply moves it to the remote SHA. | Covered locally + UI verified |
| 14.7 Restart with paused queue | `apps/api/src/services/__tests__/integrationHarness.test.ts` and `piRuntime.test.ts` cover interrupted status, released locks, retained queued follow-ups and recovery context before a new Run. | Covered locally |
| 14.8 Orchestration | `apps/api/src/server.test.ts` describe block `orchestration chat API` verifies isolated implementation Chats/Tasks, distinct sessions and worktrees, while the orchestration Chat has no writable Task. | Covered locally |

## Manual runtime evidence

- A local Chromium responsive pass exercised Projects, Dashboard and Chat at
  desktop `1440x900`, tablet landscape `1024x768`, tablet portrait `768x1024`
  and mobile `390x844`. The tablet shell retained a compact usable sidebar,
  desktop content stayed bounded, mobile navigation stayed horizontally
  scrollable, and all four viewports reported no document-level overflow. In
  Chat, typing enabled Send and the mode sheet opened without console errors.
- A Web client reached the VPS API through a Tailnet-only HTTPS proxy, selected
  the registered VPS project, opened a discussion Chat and received a streamed
  `opencode-go/deepseek-v4-flash` reply. The VPS audit recorded a completed
  `bwrap` runtime process for the same run.
- With no active Task, the Web project route opened the live `chat-pi` Ignis
  vault. A Markdown note created and edited in the browser survived a full
  reload, reopened with the same content and was confirmed in the VPS managed
  clone. Ignis stayed connected and the browser console had no errors. The
  temporary note was removed and Git status remained clean.
- In a local Chromium session at 390x844, setup completion opened Projects and
  a direct visit to `/` with a persisted backend URL also resolved to Projects.
  A project and Chat were created through the UI, a message completed through
  the fake runtime, and 23 supported routes loaded without document-level
  horizontal overflow or runtime console errors. Two additional unfinished
  skill/prompt creation URLs rendered explicit error states. The project shell
  displayed the active screen full-width with a horizontally scrollable
  project navigation strip.
- In a second local Chromium session at 390x844, a Chat loaded two persisted
  queued follow-ups. The user-visible controls reordered them, removed one and
  cleared the final item after confirmation; both the panel and SSE-backed
  header count reflected `2 -> 1 -> 0`. The mobile navigation strip stayed at
  48 px and left the queue and composer usable in the same viewport.
- A temporary real Git project produced an implementation Task whose overview
  lifecycle controls were exercised in Chromium at 390x844. Archive-cancel
  showed an explicit confirmation, completed through the API as
  `cancelled_archived`, survived reload and disabled repeated cancel/rebase
  operations; fork/rollback history actions remained available.
- A second temporary Git Task supplied a real checkpoint, two changed files and
  fake-runtime message/tool events. At 390x844, Chromium rendered the Diff
  file list and patch, Checkpoints and checkpoint diff, confirmed the presence
  of guarded Fork/Rollback actions, showed Merge disabled for `created` and
  enabled for `needs_review`, and opened Message/Tool call details by real event
  ID without console errors. A follow-up 390x844 pass then submitted the only
  offered strategy, Squash, confirmed it and reached `Слияние выполнено` with
  no console errors. The API Task was `merged`, its SHA matched the clean
  primary HEAD, and the one-parent commit contained exactly the QA file.
- A separate real worktree regression proved that Task metadata and Diff no
  longer diverge: the public Task detail and project Task list both returned
  `changedFiles: 1`, Chromium Overview rendered `1`, and the adjacent Diff
  contained exactly the same one file.
- Cleanup of the same QA data exposed and fixed a project-deletion foreign-key
  defect. An API regression now creates a Project with queued Chat history,
  deletes it through the public endpoint and verifies that Project, Chat and
  queued rows are all gone.
- A temporary bare remote was one commit ahead of its project clone. Project
  Settings inspect reported `fast_forward_available` without changing the
  clone HEAD. The apply button required confirmation; afterward the UI showed
  `fast_forward_applied`, local and remote SHA matched, `REMOTE.md` existed and
  Git status was clean.
- A live Tailnet Web session separately verified two Chats in one project:
  both received real assistant replies and retained isolated histories when
  switching between them. A second project could be created and opened; the
  current worktree additionally removes the stale-list reload requirement.
- A local 390x844 Chromium session opened an implementation Chat without an
  active Task, used its `Create next Task` form and observed the new Task ID in
  the header. API/Git verification confirmed the same Chat and PiSession, the
  requested title, and a separate clean worktree; the console stayed clean.

## External gates

- Exercise the Android and iOS clients on physical devices. The 14 July 2026
  attempt moved daemon state into the writable workspace and got past daemon
  startup, but Android enumeration timed out after 90 seconds while no emulator
  or connected-device process was present. It produced no device-level pass
  result.
- Exercise an actual merge conflict and recovery path in a mobile viewport.
  The current conflict screen is an explicit unsupported state with abort only;
  no in-app conflict editor is implemented. The normal successful squash Merge
  path has been executed through the mobile UI and is no longer an external
  gate.

See `docs/TESTING-GAPS.md` for the full boundary inventory.
