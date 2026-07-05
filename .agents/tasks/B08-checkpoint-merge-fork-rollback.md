# B08-checkpoint-merge-fork-rollback — Checkpoint/merge/fork/rollback services

## Goal

Backend side of checkpoint, fork, rollback and merge.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `api-starter/src/services/taskService.ts`
- `api-starter/src/services/gitWorktreeService.ts`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Checkpoint creates commit/patch.
- [ ] Fork creates branch/worktree from checkpoint.
- [ ] Rollback creates new task.
- [ ] Squash merge tested.

## Verification commands

```bash
pnpm --filter api test -- gitFlows
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
