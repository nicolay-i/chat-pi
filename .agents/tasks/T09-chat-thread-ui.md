# T09-chat-thread-ui — Chat thread UI

## Goal

Основной chat screen с messages/toolcards/streaming states.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `design/reference/ChatAppMobile@1x.png`
- `app-starter/src/components/chat`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] UI visually follows reference.
- [ ] Tool cards expandable.
- [ ] Streaming state visible.

## Verification commands

```bash
pnpm --filter mobile test -- chat
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
