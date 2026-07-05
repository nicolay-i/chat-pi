# T11-tasks-list-detail — Tasks list and detail

## Goal

Tasks screens for parallel tasks/statuses.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `app-starter/app/projects/[projectId]/tasks`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Running tasks independent.
- [ ] Stale/review/merged groups.
- [ ] Task detail tabs exist.

## Verification commands

```bash
pnpm --filter mobile test -- tasks
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
