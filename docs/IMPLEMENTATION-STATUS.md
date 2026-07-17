# Implementation Status

This file describes the current worktree, not the earlier generated scaffold.

## Completed core

| Area | Evidence |
| --- | --- |
| Cross-platform navigation | Explicit React Navigation adapter and route registry in `apps/mobile/src/navigation/`; URL and native stack share the same route definitions. |
| Entry and responsive navigation | The root route waits for persisted backend restoration and opens Projects when configured or Setup when not configured. Setup completion opens Projects and never bootstraps a Chat. The Web project shell uses a 48 px horizontal navigation strip below 720 px, a compact 196 px tablet rail, and a 232 px desktop rail with content bounded to 1180 px. The empty context rail was removed. Projects use a two-column desktop grid from 1024 px. |
| State | MobX `RootStore`, chat/task/theme stores, real `mobx-react-lite` observers and store integration tests. `RootStoreProvider` creates/disposes its own store per mount; production code has no global backend-store adapter. Screen tests inject an isolated store through the same Provider. |
| Typed API | Shared Zod contracts plus `apiOperations.ts`, backend route operation IDs and `apiParity.test.ts`; an isolated provider domain also has an oRPC transport mounted in Hono. |
| Chat/task runtime | One persistent PiSession is created for each Chat. Discussion/planning run it in the primary repo with Pi read-only tools; writable Tasks reuse it in their own worktrees. PiSession locks are writer-scoped, checkpoints are created for completed Task steps, and follow-up queue entries persist across restart. The Chat UI lists that queue and supports reorder, single-item removal and confirmed clearing; every mutation publishes the resulting pending count through `queue.updated`. Fork/rollback create a new Pi JSONL branch through the selected checkpoint ancestry and update its header cwd before Pi opens the next worktree. |
| Git workflow | Worktree isolation, checkpoints without empty commits, explicit archive/discard cancellation, diff, rollback within a Chat, fork into a separate Chat, manual fetch/rebase/push and squash-only merge flows are tested against temporary Git repositories. New projects keep runtime state beside, rather than inside, the canonical Git checkout; checkpoint patches live under `runtimeStatePath/checkpoints/<taskId>` and merge/rebase are serialized per project. |
| Task lifecycle UI | Task overview exposes confirmed Abort, rollback, fork, rebase, archive-cancel and discard-cancel actions through the typed API client. Active runs allow only Abort; terminal Tasks disable rebase/repeated cancellation while retaining fork/rollback history actions. Task detail/list summaries derive `changedFiles` from the same live Git diff as the Diff screen, with a fallback for discarded historical worktrees. |
| Project configuration | Files, actions, skills, prompts, providers, MCP and theme routes have client, Hono route and persistence paths. MCP configuration persists in `.agents/mcp.json`. Package installation remains deferred and is not exposed by the current API or client. |
| Project deletion | Removal runs as one SQLite transaction and clears queue history, checkpoints, runtime/process/session records, Chats, Tasks, packages and providers before deleting the Project. A queued-message history no longer blocks deletion through foreign keys. |
| Explicit remote sync UI | Project Settings offers a read-only inspect action with local/remote SHA and stale-Task count. Apply is shown only for `fast_forward_available` and requires a separate confirmation; no background fetch/apply path was added. |
| CI baseline | Pinned pnpm, frozen-lockfile install, typecheck/test/lint and Web export in GitHub Actions. |
| Deployment baseline | Expo Web is built into the VPS image and served from the same private origin as the API; production CORS allowlist, explicit loopback bind for standalone API, request body cap, structured lifecycle logs, disk monitoring, graceful Pi-child cleanup, pinned Pi CLI in Dockerfile, compose, SQLite volume and private-by-default port binding. |
| Pi sandbox | `PI_SANDBOX_MODE=bwrap` launches Pi in Linux user/PID/IPC/UTS namespaces. It mounts only the active worktree, JSONL session directory and dedicated Pi state; discussion/planning mounts the primary repo read-only. `/data/pi-agent` and session directories are created before the first launch. |
| Process audit | Every real Pi child is recorded in `runtime_processes` with PID, command, cwd, sandbox mode, Chat/Task/PiSession and terminal status. Raw Pi events are capped before they enter SQLite/SSE. |
| Backup baseline | SQLite `VACUUM INTO`, allowed `.agents` artifacts, Pi sessions plus prompt/theme runtime state, Git refs, SHA-256 manifest and integrity-checked staging restore. A guarded activation command validates exact task refs in explicit clean checkouts, recreates worktrees and rebinds staged SQLite paths. Task worktree files are deliberately excluded. |

## Verified integration gates

- Chromium rendered the responsive project dashboard and Chat at `1440x900`,
  `1024x768`, `768x1024` and `390x844`. Every viewport matched its intended
  desktop/tablet/mobile shell, had `scrollWidth === innerWidth`, and produced no
  console warning or error. The mobile composer enabled after typing and its
  mode menu opened with all options visible.
- A public Hono integration test creates two Chats, checkpoints their Tasks,
  merges one and marks its sibling stale; it then creates another Task in the
  first Chat, proving a new worktree with the same PiSession and session path.
- A completed implementation run creates a checkpoint and moves task state to
  review.
- Recovery after a backend restart releases stale locks, moves interrupted
  Tasks to `paused_after_restart`, retains pending follow-ups and requires a
  recovery context before a new run.
- API registry parity verifies all current ApiClient operation IDs have Hono
  route registration.
- The experimental provider oRPC client creates, lists and tests a provider
  through the mounted Hono transport without duplicating the provider output
  schemas.
- Graceful shutdown awaits runtime cleanup before closing the server; cleanup
  failures are logged without preventing HTTP server closure.
- New Pi sessions receive explicit resources from the task worktree's
  `.agents` directory; Pi's user-level discovery is disabled for those types.
  Task sessions start against their persisted JSONL file, rather than switching
  to a synthetic directory after startup.
- Pi RPC events are normalized for the client while preserving the original
  event under `payload.rawPiEvent`; Trace redacts and exposes this payload in
  its raw JSON view.
- Pi state can be isolated with `PI_AGENT_DIR`; the Docker image defaults that
  state directory to the persistent `/data/pi-agent` volume.
- Persistent Pi-session locks use a unique API-instance owner, atomic
  acquire-with-expiry, owner-scoped heartbeats and stale-lock cleanup during
  interrupted-run recovery.
- Pi sessions load only project-owned `.agents` resources. Package-provided
  resources are deferred and are not loaded in the current phase.
- A 390x844 Chromium pass checked 25 entry, project, Chat, file, trace,
  settings and approval URLs. The 23 supported routes had no document-level
  horizontal overflow or runtime console errors; the two direct `new` detail
  IDs exposed unfinished skill/prompt creation states documented below. The
  same pass created a project and Chat, sent a message, exercised
  settings/approval actions and verified that reopening `/` with a persisted
  backend URL resolves to `/projects`.
- Multiple Chats are usable in the interface: separate Chats can be created,
  opened and messaged without mixing their histories. Multiple projects can be
  created and opened; a newly created project is now inserted into the project
  store immediately, so returning to the list does not require a page reload.
- An implementation Chat with no active writable Task now exposes a compact
  `Create next Task` form instead of requiring an API-only operation. A real
  390x844 Chromium pass created the Task, immediately refreshed the Chat's
  active Task, retained the same Chat/PiSession and verified a new clean,
  isolated worktree without console errors.
- A separate Chromium pass at 390x844 loaded two persisted follow-ups in the
  Chat queue, reordered them, removed one and cleared the remainder after the
  confirmation step. The visible and SSE-backed count changed from 2 to 1 to
  0. The same pass caught and fixed a Web `ScrollView` flex issue so the mobile
  project navigation remains 48 px high instead of consuming unused screen
  height.
- A temporary real Git project and implementation Task were opened in Chromium
  at 390x844. The lifecycle panel rendered usable controls, archive-cancel
  required confirmation, the backend changed the Task to
  `cancelled_archived`, and reload preserved the state while disabling repeated
  cancel/rebase actions.
- A second temporary Git Task supplied a real checkpoint, two-file worktree
  diff and fake-runtime message/tool events. Chromium at 390x844 rendered the
  Diff patch, checkpoint list and checkpoint diff, Fork/Rollback confirmation
  dialogs, Merge form in both disabled (`created`) and enabled (`needs_review`)
  states, and Message/Tool call detail pages for real event IDs without console
  errors.
- A follow-up Chromium pass at 390x844 executed Merge from the rendered UI.
  The screen exposed Squash as the only strategy, required confirmation and
  reached `Слияние выполнено` without console warnings or errors. The public
  API returned the merged Task, its SHA matched the clean primary checkout
  HEAD, and the resulting one-parent commit contained exactly the QA file.
  This pass caught and fixed the previous response mismatch where the endpoint
  returned `{ mergedSha }` while the typed client expected a Task. Runtime
  guards also reject non-squash input without leaving `needs_review`, and
  primary-checkout precondition failures stay retryable instead of becoming
  false `merge_conflict` states.
- A follow-up real Git fixture verified the Task summary correction in the
  rendered UI: Overview at 390x844 showed `Changed files: 1`, while Diff showed
  the same single `ui-change.txt`; the browser console remained clean.
- A local bare remote was advanced ahead of a temporary project clone. In
  Chromium 390x844, inspect reported `fast_forward_available` while the clone
  HEAD stayed unchanged; only the separately confirmed apply moved HEAD to the
  remote SHA, reported `fast_forward_applied` and left the checkout clean.

## Current phase boundaries / release gates

1. **Application authentication.** Login, pairing and token rotation are
   intentionally outside the current Tailnet-only phase. Do not expose the API
   to the public internet.
2. **Provider secrets.** API exposes only `hasSecret`; provider metadata accepts
   only symbolic `env:`/`secret:` references and rejects raw keys. Secure secret
   resolution and a real provider transport must be added before provider
   configuration is a production feature.
3. **Packages and MCP.** Package installation and trust UI are deferred. MCP
   test checks configuration but never executes configured commands.
4. **External product surfaces.** VSCode Web remains unsupported. Ignis is a
   configured Tailnet URL; the Web route opens it at top level because the
   upstream Obsidian bundle reads its top-level parent, while Android/iOS use a
   native WebView. End-to-end Web editing against the live Ignis host has been
   verified; physical Android/iOS Ignis verification remains a release gate.
5. **Release validation.** The VPS deployment has a healthy `/health`; a Web
   client completed a browser-to-Pi discussion through Tailnet-only HTTPS, and
   the real OpenCode Go (`opencode-go/deepseek-v4-flash`) turn completed with
   `sandbox_mode = bwrap`. A standalone Android release APK completed the
   Tailnet setup and native SSE connection in a Pixel 3a API 34 emulator.
   A browser also created and edited a Markdown note in the live Ignis vault
   after Task activity had completed, reloaded the app, reopened the persisted
   content and confirmed the same file in the VPS managed clone without console
   errors. Physical Android/iOS device QA and production APK signing remain
   required. A 14 July 2026 retry with `agent-device 0.16.7` first failed to
   start its daemon from the restricted user/C:\tmp state. Moving state into the
   writable workspace let the daemon start, but Android discovery then timed
   out after 90 seconds (`mrk1p2jk-5aacca0a`) while no emulator/qemu/adb process
   was running. No physical-device result is claimed.
6. **oRPC decision.** The provider experiment proves Hono transport and
   server/client type inference, but it has not yet been bundled into the Expo
   application or evaluated for OpenAPI generation. Existing `/api/*` routes
   remain the product API until those gates pass.
7. **Conflict resolution.** The conflict route renders an explicit unsupported
   state and offers abort only. A real `merge_conflict` fixture and an actual
   mobile recovery workflow remain release gates; the product does not yet
   provide an in-app conflict editor.

## Quality notes

- API and mobile tests are green. `node:sqlite` emits Node's experimental API
  warning during API tests.
- ESLint is blocking but currently reports warnings in pre-existing async data
  loading screens and legacy test mocks. No lint errors are present.
- Approvals is still a local mock-data surface. Skill creation/extraction is
  visibly scaffolded but is not yet a complete backend-backed workflow.
