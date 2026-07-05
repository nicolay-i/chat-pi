# T02-design-system-reference — Design system from reference

## Goal

Реализовать design tokens и базовые UI components по приложенному reference.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `docs/03-design-system.md`
- `app-starter/src/theme`
- `app-starter/src/components/ui`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] MessageBubble, ToolCard, QuickActionChip, Composer существуют.
- [ ] ChatReferenceScreen воспроизводит структуру screenshot.
- [ ] Цвета/радиусы centralized tokens.

## Verification commands

```bash
pnpm --filter mobile typecheck
pnpm --filter mobile test -- ChatReference
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
