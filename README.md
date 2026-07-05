# Pi Agents Mobile/Web — ТЗ, план реализации и starter-файлы

Архив описывает приложение-оболочку для работы с Pi через web / Android / iOS:

- React Native + Web клиент на Expo Router.
- Hono backend на VPS.
- Типизированные контракты через общие Zod-схемы и опционально oRPC.
- Pi runtime как agent engine.
- `.agents` как системная папка проекта вместо `.pi`.
- Изоляция параллельных writable-задач через git worktree.
- Механика chat ↔ Pi session sync, fork, rollback, merge, quick actions, skills, provider/plugin manager.

## Что внутри

```text
docs/
  00-product-brief.md
  01-technical-requirements.md
  02-screen-specification.md
  03-design-system.md
  04-architecture.md
  05-api-contract.md
  06-data-model.md
  07-git-worktree-runtime.md
  08-pi-sync-packages-providers.md
  09-test-strategy.md
  10-subagents-implementation-plan.md
  11-definition-of-done.md
  12-source-notes.md

.agents/
  project.json
  tasks/*.md
  prompts/*.md
  skills/*/SKILL.md

app-starter/
  Expo / React Native Web стартовый каркас.

api-starter/
  Hono стартовый каркас.

packages/contracts/
  Общие типы и Zod-схемы.

scripts/
  bootstrap-react-native.sh
  bootstrap-api.sh
  verify-subagent-result.mjs

design/reference/
  Исходный пример дизайна из чата.
```

## Рекомендуемый порядок чтения

1. `docs/01-technical-requirements.md` — ТЗ.
2. `docs/02-screen-specification.md` — все экраны.
3. `docs/10-subagents-implementation-plan.md` — декомпозиция на subagents.
4. `.agents/tasks/` — отдельные задания для subagents с проверками.
5. `scripts/bootstrap-react-native.sh` — старт создания React Native проекта.

## Базовое решение по стеку

Для фронта использовать Expo / React Native / React Native Web, потому что приложение должно иметь один общий UI-код для iOS, Android и web. Backend — Hono на Node.js/Bun-compatible runtime, typed contracts — shared Zod schemas + Hono RPC или oRPC. Потоки событий — отдельными SSE/WebSocket endpoints, не через обычный RPC.

## Главный invariant

Любая параллельная writable-работа должна запускаться как отдельный `Task`:

```text
Task = branch + git worktree + Pi session + event stream + checkpoints
```

Main checkout не используется для прямых записей агентом. Завершённая задача попадает в основной repo через явное действие `Слить в repo`.
