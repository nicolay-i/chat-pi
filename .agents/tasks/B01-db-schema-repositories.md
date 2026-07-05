# B01-db-schema-repositories — DB schema and repositories

## Goal

Реализовать migrations/repositories для core entities.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `docs/06-data-model.md`
- `api-starter/src/db`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Migrations apply to temp DB.
- [ ] CRUD tests for Project/Chat/Task/Event.
- [ ] Event ordering stable.

## Verification commands

```bash
pnpm --filter api test -- db
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
