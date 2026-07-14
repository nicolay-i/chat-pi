# Testing Gaps

The suite covers contracts, API route/service integration, real temporary Git
repositories, MobX stores and mobile screens. The following surfaces are not
yet proven by automated tests and remain release gates.

## End-to-end runtime

- No CI test connects a running Hono process, actual browser bundle and real Pi
  CLI in one flow. A manual Tailnet-only Web -> VPS -> bwrap -> OpenCode Go
  discussion flow has been completed; it still needs reproducible CI coverage.
- The real Pi test is opt-in because it depends on the local CLI, account and
  model availability. Run it before a release after the first Pi launch has
  completed:

  ```powershell
  $env:PI_REAL_E2E = '1'
  pnpm --filter @pi-agents/api test -- src/services/__tests__/piRuntime.test.ts
  ```
- When `PI_AGENT_DIR` is used, it must contain the selected provider's
  credentials (or the provider must be configured through environment
  variables); the isolated directory intentionally does not copy `~/.pi`.
- SSE server and client replay are tested, but a long-lived mobile client
  connected to a real server process is not continuously exercised in CI.

## Device and visual verification

- A native Android debug build was assembled on Windows and opened on a local
  Pixel 3a API 34 emulator, showing the setup screen after Metro served the
  bundle. The debug APK is not a standalone release artifact: it requires a
  reachable Metro server. On the current Windows Codex host, `agent-device
  metro prepare` cannot start its detached Metro child and the emulator cannot
  reach a localhost-bound manual server through `10.0.2.2`.
- A standalone Android release APK was assembled, installed in the same Pixel
  3a API 34 emulator and connected to the VPS through Tailnet HTTPS. It
  completed setup, opened the persisted Chat and established the native SSE
  transport without Metro. Physical Android/iOS device QA and production APK
  signing remain release gates.
- On 14 July 2026, `agent-device 0.16.7` was retried for current Android/iOS
  device enumeration. Restricted user/C:\tmp state caused the initial daemon
  startup failures (`mrk0yl3c-8b11b7b1`, `mrk0zoax-1e6323ad`). A writable
  workspace state directory let the daemon start, but Android discovery then
  reached its 90-second request timeout (`mrk1p2jk-5aacca0a`); no
  emulator/qemu/adb process was present. This is an automation-host/device
  availability blocker, not evidence that either native client works on a
  physical device.
- The experimental provider oRPC client is integration-tested in Node only.
  It has not yet been added to the Expo bundle or tested on iOS/Android.
- Explicit remote sync has a component test and a real local Chromium/Git pass
  for the fast-forward path. Diverged/local-ahead visual states and stale-Task
  presentation still lack browser fixtures.
- There is no visual-regression suite for React Native Web, responsive layout,
  dark theme or screen-reader traversal. A manual Chromium pass at 390x844
  checked 25 URLs after the responsive shell fix; 23 supported routes had no
  document-level horizontal overflow or runtime console errors, while two
  unfinished `new` detail IDs rendered their error states. This is not
  screenshot regression coverage.
- VSCode Web remains unsupported. Ignis now has a configured Tailnet URL and
  a writable `chat-pi` vault. A fresh Web browser session has resolved the
  project route and loaded the live vault through Ignis's API. The Web route
  opens Ignis at top level: the upstream Obsidian bundle reads its top-level
  parent and therefore cannot run in a cross-origin iframe. Android/iOS use a
  native WebView. Ignis-only `.obsidian/` state is ignored locally in the
  managed clone. A full Web edit after completed Task activity was verified
  against the live vault: the note survived reload, reopened with identical
  content, appeared in the VPS managed clone and produced no console errors.
  The temporary verification note was removed and the clone remained clean.
- The current Mobile test suite completes without React `act(...)` warnings.
- The mobile browser pass exercised root restoration, project creation,
  project navigation, Chat creation/message delivery, settings and local
  approval actions. A second 390x844 pass exercised a populated persistent
  Chat queue end to end: open, reorder, remove, confirmed clear and SSE count
  refresh. A temporary real implementation Task also exercised the Task
  overview lifecycle panel and confirmed archive-cancel through the API.
  A subsequent temporary real Git Task supplied a checkpoint, a two-file diff
  and fake-runtime events: Chromium at 390x844 rendered Diff and patch content,
  Checkpoints and checkpoint diff, Fork/Rollback confirmations, disabled and
  enabled Merge states, and Message/Tool call details for real event IDs with
  no console errors. A later 390x844 pass submitted and confirmed a real
  squash-only Merge, reached the success screen, verified Task/HEAD SHA parity,
  a clean checkout and a one-parent commit containing exactly the QA file.
  A real conflict fixture and mobile conflict recovery remain unproven; the
  current conflict screen explicitly states that in-app resolution is
  unsupported.
- A separate 390x844 pass exercised the sequential-Task UI that was previously
  API-only: an implementation Chat with no active Task created the next Task,
  refreshed its active ID and retained the same Chat/PiSession while Git
  verification showed a new clean worktree and the console remained clean.
- Approvals currently resolves mock rows only. `Skills -> New` reaches an
  unfinished detail path and `Extract from chat` has no backend-backed action;
  these must not be treated as production-complete workflows.

## External integrations

- The OpenCode Go environment-provider path was exercised on the VPS through a
  real completed `bwrap` Pi turn using `opencode-go/deepseek-v4-flash`. Provider
  records still expose only symbolic secret references and have no server-side
  secret store.
- The provider oRPC experiment does not yet generate an OpenAPI document:
  `@orpc/openapi` is deliberately not a production dependency until the mobile
  transport decision is made.
- MCP configuration test intentionally does not spawn the configured process.
- The Docker image builds locally, Compose starts the API with a healthy
  `/health` response, and the VPS has run the pinned Pi CLI (`0.80.3`) through
  the configured `bubblewrap` namespace. The active profile stays
  unprivileged: it does not mount procfs and passes only the required device
  nodes, worktree, session directory, Pi state and explicit provider allowlist.
  Replace `unconfined` seccomp with a reviewed custom profile before a hardened
  deployment.

## Security and operations

- User authentication is intentionally excluded from the current Tailnet-only
  phase. The production CORS allowlist and body cap are in place; public
  exposure remains unsupported.
- The selected OpenVZ VPS has no `/dev/net/tun`. Tailscale therefore runs in
  userspace networking mode; the private `tailscale serve` endpoint is used for
  deployment verification.
- Backup and integrity-checked staging restore cover SQLite, allowed `.agents`
  resources, runtime session files and Git refs. Guarded activation can rebind
  an explicit clean checkout only when every restored task branch has the exact
  backed-up SHA; it intentionally does not clone/fetch repositories. A full
  real-Pi continuation after activation still needs an end-to-end release run.
- Multi-instance process supervision/metrics and external disk alert delivery
  are still required for VPS deployment. The single-container baseline now has
  Docker restart policy, structured lifecycle logs, disk-capacity checks and
  graceful `SIGINT`/`SIGTERM` shutdown.
