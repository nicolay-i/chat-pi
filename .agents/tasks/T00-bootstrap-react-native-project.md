# T00-bootstrap-react-native-project — Bootstrap React Native project

## Goal

Создать Expo React Native Web проект и подготовить стартовую структуру.

## Context docs

- `docs/01-technical-requirements.md`
- `docs/02-screen-specification.md`
- `docs/11-definition-of-done.md`

## Inputs / files to inspect first

- `scripts/bootstrap-react-native.sh`
- `app-starter/`
- `docs/12-source-notes.md`

## Implementation rules

- Do not make unrelated rewrites.
- Keep TypeScript strict.
- Use shared contracts from `packages/contracts` for DTOs.
- For UI work, implement loading, empty, error, and success states where applicable.
- For backend writable flows, never write into main checkout; use task worktree policy.
- Add tests for new behavior or state why a test is not practical yet.

## Acceptance checks

- [ ] В проекте есть Expo Router routes: `_layout`, `index`, setup, projects, chat mock.
- [ ] TypeScript strict включён.
- [ ] React Native Web web старт описан и работает после install.
- [ ] Зависимости устанавливаются через `create-expo-app@latest --template default@sdk-57` и `expo install` для Expo-managed пакетов.

## Verification commands

```bash
pnpm --filter mobile typecheck
pnpm --filter mobile web
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
