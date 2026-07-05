# T10-composer-queue-actions — Composer queue modes and quick actions

## Goal

Send/Follow-up/Steer/Abort & replace composer mechanics and quick action chips.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `app-starter/src/components/chat/Composer.tsx`
- `app-starter/src/features/actions`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Buttons enabled/disabled by task status.
- [ ] Quick actions contextual.
- [ ] Keyboard-safe layout.

## Verification commands

```bash
pnpm --filter mobile test -- composer
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
