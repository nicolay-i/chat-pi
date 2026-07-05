# B00-hono-api-bootstrap — Hono API bootstrap

## Goal

Создать Hono API app с health/capabilities, env config, tests.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `api-starter`
- `docs/05-api-contract.md`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] GET /health returns ok.
- [ ] GET /api/capabilities returns feature flags.
- [ ] Server starts on configured port.

## Verification commands

```bash
pnpm --filter api typecheck
pnpm --filter api test
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
