# Pi Agents Mobile/Web

Приложение-оболочка для работы с Pi через web / Android / iOS: React Native + Web
клиент на Expo Router, Hono backend на Node, типизированные контракты через общие
Zod-схемы, git worktree как средство изоляции параллельных writable-задач.

- **Frontend** (`mobile`): Expo Router (React Native + Web), TypeScript strict, jest-expo.
- **Backend** (`api`): Hono на Node 24, `node:sqlite`, vitest, реальный git worktree.
- **Contracts** (`@pi-agents/contracts`): общие Zod-схемы и типы.
- `.agents/` — системная папка проекта (манифест задач, промпты, skills).

> Главный инвариант: любая параллельная writable-работа запускается как отдельный
> `Task = branch + git worktree + Pi session + event stream + checkpoints`. Main
> checkout не используется для прямых записей агентом; готовая задача попадает в
> основной repo через явное «Слить в repo».

Подробное ТЗ — в `docs/01-technical-requirements.md` и `docs/02-screen-specification.md`.
Текущий статус реализации — в `docs/IMPLEMENTATION-STATUS.md`.

---

## Установка и запуск

### Prerequisites

- **Node 24+** (backend использует встроенный `node:sqlite`).
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@latest --activate`).
- **git** в PATH (backend выполняет реальные git-операции через child_process).
- (Опционально) Expo CLI / Expo Go для запуска мобильного клиента на устройстве.

### Install

Из корня репозитория (workspaces резолвятся автоматически):

```bash
pnpm install
```

### Verify

Все три команды должны быть зелёными:

```bash
pnpm -r typecheck   # tsc --noEmit в каждом пакете
pnpm -r test        # contracts (vitest) + api (vitest) + mobile (jest-expo)
pnpm -r lint        # tsc в api/contracts, expo lint в mobile
```

Тесты: `contracts` 16 + `api` 94 + `mobile` 214 = **324 теста**.

### Run API

```bash
pnpm --filter api dev     # tsx watch src/index.ts
```

По умолчанию поднимается на `http://localhost:8787`. Переменные окружения
(читаются в `api-starter/src/config.ts` и `api-starter/src/db/db.ts`):

| Переменная   | По умолчанию    | Описание                                                            |
| ------------ | --------------- | ------------------------------------------------------------------ |
| `PORT`       | `8787`          | Порт HTTP-сервера.                                                 |
| `NODE_ENV`   | `development`   | Режим работы.                                                       |
| `LOG_LEVEL`  | `info`          | Уровень логирования.                                                |
| `DB_PATH`    | `.data/app.db`  | Путь к файлу SQLite (создаётся при первом запуске). `:memory:` — в RAM. |

> **Замечание:** `node:sqlite` в Node 24 — experimental API. Предупреждение
> `ExperimentalWarning: node:sqlite is an experimental feature` выводится в
> консоль, но **является косметическим** и не влияет на работу.

### Run mobile / web

```bash
pnpm --filter mobile start   # Expo Dev UI
# в интерактивном меню: w — web, либо отсканировать QR для Expo Go
# либо сразу web-only:
pnpm --filter mobile web
```

### First-run flow

1. Запустить API: `pnpm --filter api dev`.
2. В приложении открыть экран `/setup`.
3. Ввести backend URL (например `http://localhost:8787`) → **Test connection**
   → **Save**.
4. Происходит редирект на `/projects`. Дальнейшая навигация — из дашборда проекта
   (chats / tasks / files / settings).

---

## Арххитектура кратко

### Раскладка монорепо

Три пакета + системная папка `.agents`:

```text
chat-pi/
├── app-starter/            # пакет `mobile`  — Expo Router (RN + Web)
│   ├── app/                # 22 файловых маршрута Expo Router
│   └── src/{api,components,features,state,theme,mocks}
├── api-starter/            # пакет `api`     — Hono backend
│   └── src/{config,server,index,db,realtime,services}
├── packages/contracts/     # `@pi-agents/contracts` — Zod-схемы и типы
│   └── src/{index,schemas}
└── .agents/                # системная папка проекта
    ├── project.json
    └── tasks/{manifest.json,index.md,T00–T22,B00–B08}
```

### Поток данных

```text
App message
   │  POST /api/.../messages
   ▼
api: taskService → piRuntimeService (Fake / stub) → eventStore.append()
   │                                                       │
   │                                                       ▼ pub/sub
   ▼                                          SSE /api/.../events?after=<id>
mobile: realtimeClient → RealtimeManager (resume-by-event-id + backoff)
   │
   ▼
eventReducer (чистый, детерминированный) → zustand stores → UI
```

- `eventReducer` — чистая функция; одинаковая последовательность событий даёт
  одинаковое состояние (тестируется явно).
- Reconnect/resume догружает события после последнего `event_id` через query-параметр
  `?after=` (поддерживается SSE-эндпоинтами чата/задачи/проекта).
- Состояния подключения и оффлайн-баннер живут в `state/connectionStore` и
  отображаются глобально в `_layout.tsx`.

### Структура проекта (реализовано)

**`app-starter/app/`** — маршруты Expo Router:

```text
_layout.tsx · index.tsx · setup.tsx · projects.tsx · approvals.tsx · settings.tsx
projects/
├── new.tsx
└── [projectId]/
    ├── _layout.tsx · index.tsx · actions.tsx · files.tsx · obsidian.tsx
    ├── chats/        index.tsx · new.tsx · [chatId]/{index,actions,trace,tree}.tsx
    │                                └── [chatId]/{messages,toolcalls}/
    ├── tasks/        index.tsx · [taskId]/{index,diff,merge,conflicts,
    │                                       checkpoints,vscode}.tsx
    ├── files/
    └── settings/     {project,theme,providers,mcp,packages,packages/,prompts,
                       prompts/,skills,skills/}.tsx
```

**`app-starter/src/`**:

```text
api/        ApiClient (~40 методов, ApiClientError), eventStream, ApiClient tests
components/ chat/ {MessageBubble, ToolCard, Composer, DiffPreview, QuickActionChip,
                  ChatReferenceScreen, composerRules}
            shell/ {Placeholder, ProjectWebShell}
features/   {projects, chats, chat, actions, approvals, tasks, trace, diff, merge,
             checkpoints, files, skills, theme} + settings subdirs
state/      backendStore · backendStorage (expo-secure-store) · connectionStore ·
            eventReducer · realtimeClient · RealtimeManager · index
theme/      design tokens + themeStore (zustand override layer)
mocks/      фикстуры для UI-тестов и офлайн-режима
```

**`api-starter/src/`**:

```text
config.ts     PORT / NODE_ENV / LOG_LEVEL (с валидацией порта)
index.ts      serve(createApp(getDb()))
server.ts     createApp(db) — DB-backed Hono routes, SSE, onError
db/           db.ts · migrations.ts (8 таблиц) · util.ts · repositories/
              repositories: projects · chats · tasks · events · pi_sessions ·
                            checkpoints · packages · providers
realtime/     eventStore.ts (append + pub/sub) · sse.ts (web-standard SSE helper)
services/     projectService · chatService · taskService (status-transition)
              gitExec · gitWorktreeService (child_process)
              piRuntimeService · runtimeManager · piJsonl · sessionSyncService
              checkpointService · forkService · rollbackService · mergeService
              packageService · providerService · actionEngine · skillRunner
              taskStatus
```

**`packages/contracts/src/`** — `schemas.ts` (20+ Zod-схем) + `index.ts`.

### Заявленные заглушки (важно!)

Следующие подсистемы реализованы как явные **stubs** и не претендуют на
production-готовность — помечено, чтобы не вводить в заблуждение:

- **Pi runtime adapter** (`piRuntimeService.PiRuntimeAdapter`) — реальный бинарник
  Pi не подключён; в продакшене используется `FakePiRuntime` + `RuntimeManager`.
  Полноценная интеграция с Pi CLI — отдельная задача после появления бинарника.
- **`providerService` / "Test connection"** — transport замокан; реальных запросов
  к OpenAI / Anthropic / Google не выполняется.
- **`packageService.resolvePackage` / `installPackage`** — заглушки: нет реального
  обращения к npm registry / git clone / local path.
- **WebSocket realtime path** — стаб, end-to-end не тестируется (только SSE).

Полный список известных лакун в покрытии — `docs/TESTING-GAPS.md`.

---

## Документация и навигация

- `docs/00–12-*.md` — ТЗ, экраны, дизайн-система, архитектура, API-контракт,
  data-model, git-worktree runtime, pi-sync, test-strategy, subagents plan, DoD,
  source notes.
- `docs/IMPLEMENTATION-STATUS.md` — карта «задача → статус → файлы → lacuna»
  по всем 33 задачам манифеста.
- `docs/TESTING-GAPS.md` — задокументированные (намеренно) пробелы в автотестах.
- `.agents/tasks/manifest.json` — формальный манифест 33 задач (T00–T22, B00–B08).
- `.agents/tasks/index.md` — индекс файлов задач с отметками статуса.
- `.agents/status.json` — машинно-читаемое отображение `task_id → status`.
- `.agents/project.json` — политика задач (worktree, rollback, merge strategy,
  требования к верификации).

### Рекомендуемый порядок чтения

1. `docs/01-technical-requirements.md` — ТЗ.
2. `docs/02-screen-specification.md` — спецификация экранов.
3. `docs/04-architecture.md` — архитектура высокого уровня.
4. `docs/IMPLEMENTATION-STATUS.md` — что фактически реализовано.
5. `docs/10-subagents-implementation-plan.md` — декомпозиция на подагентов.
6. `.agents/tasks/` — индивидуальные карточки задач.

### CI

`.github/workflows/ci.yml`: на `push`/`pull_request` в `main` запускаются
`pnpm -r typecheck` и `pnpm -r test` как обязательные гейты; `pnpm -r lint`
выполняется с `continue-on-error: true` (не блокирует).
