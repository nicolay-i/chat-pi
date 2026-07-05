# B03-git-worktree-manager — Git worktree manager

## Goal

Изоляция writable tasks через git branch/worktree.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `docs/07-git-worktree-runtime.md`
- `api-starter/src/services/gitWorktreeService.ts`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Temp repo creates two worktrees for two tasks.
- [ ] Main checkout remains clean.
- [ ] Stale target branch detected.

## Verification commands

```bash
pnpm --filter api test -- worktree
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
