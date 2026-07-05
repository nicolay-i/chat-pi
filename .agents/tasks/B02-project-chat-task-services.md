# B02-project-chat-task-services — Project/chat/task services

## Goal

Сервисы создания проектов, чатов и tasks.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `api-starter/src/services`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Implementation chat creates writable task if requested.
- [ ] Discussion chat does not create worktree.
- [ ] Task statuses valid.

## Verification commands

```bash
pnpm --filter api test -- services
pnpm --filter api typecheck
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
