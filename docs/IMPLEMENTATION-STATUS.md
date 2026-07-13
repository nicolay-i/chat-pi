# Implementation Status

This file describes the current worktree, not the earlier generated scaffold.

## Completed core

| Area | Evidence |
| --- | --- |
| Cross-platform navigation | Explicit React Navigation adapter and route registry in `apps/mobile/src/navigation/`; URL and native stack share the same route definitions. |
| State | MobX `RootStore`, chat/task/theme stores, real `mobx-react-lite` observers and store integration tests. `RootStoreProvider` creates/disposes its own store per mount; production code has no global backend-store adapter. Screen tests inject an isolated store through the same Provider. |
| Typed API | Shared Zod contracts plus `apiOperations.ts`, backend route operation IDs and `apiParity.test.ts`; an isolated provider domain also has an oRPC transport mounted in Hono. |
| Chat/task runtime | One persistent PiSession is created for each Chat. Discussion/planning run it in the primary repo with Pi read-only tools; writable Tasks reuse it in their own worktrees. PiSession locks are writer-scoped, checkpoints are created for completed Task steps, and follow-up queue entries persist across restart. Fork/rollback create a new Pi JSONL branch through the selected checkpoint ancestry and update its header cwd before Pi opens the next worktree. |
| Git workflow | Worktree isolation, checkpoints without empty commits, explicit archive/discard cancellation, diff, rollback within a Chat, fork into a separate Chat, manual fetch/rebase/push and merge flows are tested against temporary Git repositories. New projects keep runtime state beside, rather than inside, the canonical Git checkout; checkpoint patches live under `runtimeStatePath/checkpoints/<taskId>` and merge/rebase are serialized per project. |
| Project configuration | Files, actions, skills, prompts, providers, MCP and theme routes have client, Hono route and persistence paths. MCP configuration persists in `.agents/mcp.json`. Package installation remains deferred and is not exposed by the current API or client. |
| CI baseline | Pinned pnpm, frozen-lockfile install, typecheck/test/lint and Web export in GitHub Actions. |
| Deployment baseline | Expo Web is built into the VPS image and served from the same private origin as the API; production CORS allowlist, explicit loopback bind for standalone API, request body cap, per-client package-resolve rate limit, structured lifecycle logs, disk monitoring, graceful Pi-child cleanup, pinned Pi CLI in Dockerfile, compose, SQLite volume and private-by-default port binding. |
| Pi sandbox | `PI_SANDBOX_MODE=bwrap` launches Pi in Linux user/PID/IPC/UTS namespaces. It mounts only the active worktree, JSONL session directory and dedicated Pi state; discussion/planning mounts the primary repo read-only. `/data/pi-agent` and session directories are created before the first launch. |
| Process audit | Every real Pi child is recorded in `runtime_processes` with PID, command, cwd, sandbox mode, Chat/Task/PiSession and terminal status. Raw Pi events are capped before they enter SQLite/SSE. |
| Backup baseline | SQLite `VACUUM INTO`, allowed `.agents` artifacts, Pi sessions plus prompt/theme runtime state, Git refs, SHA-256 manifest and integrity-checked staging restore. A guarded activation command validates exact task refs in explicit clean checkouts, recreates worktrees and rebinds staged SQLite paths. Task worktree files are deliberately excluded. |

## Verified integration gates

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
   configured Tailnet URL with web iframe/native external opening; deployment
   and end-to-end editing against a real Ignis host remain release gates.
5. **Release validation.** The VPS deployment has a healthy `/health`; a Web
   client completed a browser-to-Pi discussion through Tailnet-only HTTPS, and
   the real OpenCode Go (`opencode-go/deepseek-v4-flash`) turn completed with
   `sandbox_mode = bwrap`. A standalone Android release APK completed the
   Tailnet setup and native SSE connection in a Pixel 3a API 34 emulator.
   Physical Android/iOS device QA and production APK signing remain required.
6. **oRPC decision.** The provider experiment proves Hono transport and
   server/client type inference, but it has not yet been bundled into the Expo
   application or evaluated for OpenAPI generation. Existing `/api/*` routes
   remain the product API until those gates pass.

## Quality notes

- API and mobile tests are green. `node:sqlite` emits Node's experimental API
  warning during API tests.
- ESLint is blocking but currently reports warnings in pre-existing async data
  loading screens and legacy test mocks. No lint errors are present.
