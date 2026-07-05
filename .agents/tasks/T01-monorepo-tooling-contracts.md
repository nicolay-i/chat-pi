# T01-monorepo-tooling-contracts — Monorepo tooling and contracts

## Goal

Настроить workspace, shared contracts и базовые scripts.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `pnpm-workspace.yaml`
- `packages/contracts`
- `apps/mobile`
- `apps/api`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Фронт и backend импортируют типы из `packages/contracts`.
- [ ] Нет duplicated DTO types для Project/Chat/Task.
- [ ] Workspace scripts запускают typecheck/test.

## Verification commands

```bash
pnpm -r typecheck
pnpm -r test
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
