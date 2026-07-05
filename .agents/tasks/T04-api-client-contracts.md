# T04-api-client-contracts — API client and schemas

## Goal

Собрать typed API client и schemas на shared contracts.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `packages/contracts/src`
- `app-starter/src/api`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Все request/response schemas находятся в contracts.
- [ ] API errors normalized.
- [ ] No `any` in exported client methods.

## Verification commands

```bash
pnpm --filter contracts typecheck
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
