# Testing Gaps

The suite covers contracts, API route/service integration, real temporary Git
repositories, MobX stores and mobile screens. The following surfaces are not
yet proven by automated tests and remain release gates.

## End-to-end runtime

- No CI test connects a running Hono process, actual browser bundle and real Pi
  CLI in one flow.
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

- Android/iOS flows have not been checked on physical devices after the explicit
  navigation migration.
- The experimental provider oRPC client is integration-tested in Node only.
  It has not yet been added to the Expo bundle or tested on iOS/Android.
- There is no visual-regression suite for React Native Web, responsive layout,
  dark theme or screen-reader traversal.
- VSCode Web and Obsidian/Ignis have no end-to-end product flow yet because the
  corresponding backend capabilities are absent.
- Current React 19 tests still emit several `act(...)` warnings. They do not
  fail the suite, but each affected interaction should be cleaned up.

## External integrations

- Provider connection testing is synthetic and secrets have no server-side
  secure storage.
- The provider oRPC experiment does not yet generate an OpenAPI document:
  `@orpc/openapi` is deliberately not a production dependency until the mobile
  transport decision is made.
- Local package resolution reads `pi-package.json` without executing package
  code; trust materializes it under `.agents/packages`. npm and Git sources are
  still review-only and must remain trust-gated when real fetch/install support
  is added.
- MCP configuration test intentionally does not spawn the configured process.
- The Docker image installs the pinned Pi CLI and compose is syntax-validated;
  a complete image build and Pi start/healthcheck test requires a running
  Docker engine and configured provider credentials.

## Security and operations

- No authentication exists yet. The production CORS allowlist, body cap and
  per-process package-resolution rate limit are in place, but none substitute
  for authentication. Multi-instance deployment needs a shared rate-limit store.
- Backup and integrity-checked staging restore cover SQLite, allowed `.agents`
  resources, runtime session files and Git refs. Guarded activation can rebind
  an explicit clean checkout only when every restored task branch has the exact
  backed-up SHA; it intentionally does not clone/fetch repositories. A full
  real-Pi continuation after activation still needs an end-to-end release run.
- Multi-instance process supervision/metrics and external disk alert delivery
  are still required for VPS deployment. The single-container baseline now has
  Docker restart policy, structured lifecycle logs, disk-capacity checks and
  graceful `SIGINT`/`SIGTERM` shutdown.
