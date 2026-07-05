# T05-realtime-event-stream — Realtime event stream

## Goal

Реализовать SSE/WebSocket abstraction с resume by event id.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `app-starter/src/api/eventStream.ts`
- `app-starter/src/state`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Reconnect догружает events after last id.
- [ ] Reducer deterministic for same event sequence.
- [ ] Offline state reflected in UI.

## Verification commands

```bash
pnpm --filter mobile test -- eventStream
pnpm --filter mobile typecheck
```

## Required final report

```text
Status: done | partial | blocked
Changed files:
Implementation summary:
Verification commands run:
Manual checks:
Known gaps:
Follow-up tasks:
```
