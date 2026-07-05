# B07-actions-skills-packages-providers — Actions, skills, packages, providers

## Goal

Action engine, skill runner, package/provider manager.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `api-starter/src/services/actionEngine.ts`
- `api-starter/src/services/packageService.ts`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] Package resolve/install review flow.
- [ ] Untrusted extensions not loaded.
- [ ] Provider secret redacted.

## Verification commands

```bash
pnpm --filter api test -- packages
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
