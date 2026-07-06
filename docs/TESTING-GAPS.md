# Testing gaps

Known, intentionally-documented gaps in the automated test coverage of the
`chat-pi` workspace. These items are not regressions — they describe areas that
the current unit/component suites do **not** exercise. Each entry lists the
missing surface and why it is hard to cover today.

The list is grouped by area and kept specific so it can drive follow-up tasks.

## Integration / end-to-end

- No end-to-end test drives the Hono API server together with the React Native
  client. The `api` package is tested with an in-memory SQLite DB; the `mobile`
  package is tested with mocked `ApiClient`. The two never meet in CI.
- SSE live-push is validated only via replay (`RealtimeManager.test.ts`
  consumes recorded envelopes). No test holds an open SSE stream against the
  server and asserts an event arrives on the client.
- WebSocket realtime path is stubbed and untested end-to-end.

## Backend runtime adapters

- The Pi runtime adapter (B06 JSONL tailer / file-watch) is not covered by a
  long-running integration test. File growth, rotation, and tail resumption are
  untested against a real log file.
- Git operations are exercised only against a temporary `git init` repo. Merge
  conflicts, rebase, and large-repo behaviour are not simulated.
- Worktree creation/teardown (`supportsWorktrees`) is not asserted against a
  real filesystem worktree lifecycle.

## Providers & packages

- `resolvePackage` / `installPackage` are stubbed: no real npm registry, git
  clone, or local path resolution runs in tests.
- Provider "Test connection" hits a mocked transport; real OpenAI / Anthropic /
  Google round-trips are not covered.
- Secret storage (`expo-secure-store`) write/read is mocked; no device test.

## React Native components

- No snapshot or visual regression tests for screens. Pixel/layout differences
  (spacing, overflow, dark theme) are not caught automatically.
- `react-native-web` rendering is not regression-tested. The web-only
  `ProjectWebShell` 3-column layout has no test.
- Theme override layer (`themeStore` overrides) is validated at the store level
  but is not wired into the shared components in tests — preview-only.

## Accessibility

- Only `accessibilityLabel` *presence* is asserted (see
  `src/components/__tests__/accessibility.test.tsx`). A full TalkBack / VoiceOver
  traversal is not automated.
- Focus order, swipe-navigation sequence, and `accessibilityState` correctness
  are not asserted.
- Colour-contrast ratios are not measured automatically; colour is paired with
  text in badges (TaskStatusBadge, ToolCard, DiffFileList) but contrast is
  eyeballed, not computed.

## CI

- The workflow runs `typecheck` + `test` as required gates; `lint`
  (`pnpm -r lint`) runs with `continue-on-error` and does not block. Lint
  regressions can therefore land unnoticed.
- No coverage threshold is enforced; coverage is not collected or uploaded.
- Build artifacts (Expo bundle, API build) are not produced or smoke-tested in
  CI.

## Data / contracts

- Zod schemas are unit-tested for shape, but cross-package compatibility (API
  emits → contract parses → client renders) is not asserted in a single suite.
- Migration / seed scripts for `node:sqlite` are not covered by an automated
  round-trip test.

## Non-functional

- Offline / reconnect behaviour (`connectionStore` + `OfflineBanner`) is tested
  in isolation; the full reconnect-and-resume-sequence is not simulated.
- Performance: no test guards render counts or message-list virtualisation
  under large histories.
- Internationalisation: UI strings are mixed Russian/English; no test enforces
  a single locale or a translation-table contract.
