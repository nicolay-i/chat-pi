# 01. Техническое задание

> Статус: исторический design draft. Для текущего релиза приоритет имеет
> `plans/2.md`; package installation, marketplace и trust UI отложены.

## 1. Общие требования

### 1.1. Платформы

Приложение должно работать на:

- iOS native app;
- Android native app;
- web browser;
- narrow mobile web viewport;
- desktop browser viewport.

### 1.2. Frontend stack

- React Native + Web.
- Expo Router для маршрутизации.
- TypeScript strict mode.
- Общие компоненты для mobile/web.
- Web-only компоненты допускаются для Monaco diff, VSCode Web, Obsidian/Ignis.
- Native-only компоненты допускаются для push notifications, secure storage, share sheet.

### 1.3. Backend stack

- HonoJS.
- Shared TypeScript/Zod contracts.
- Hono RPC или oRPC для типизированных команд/queries.
- SSE или WebSocket для realtime event stream.
- Backend расположен на VPS.
- Один пользователь, но все операции всё равно должны иметь explicit session/device identity.

### 1.4. Agent runtime

- Pi используется как agent harness через SDK/CLI/JSON mode adapter.
- Системный каталог проекта: `.agents`.
- Pi-native `.pi` не должен быть source of truth.
- Для Pi compatibility реализуется `AgentsResourceLoader`, который читает `.agents/skills`, `.agents/prompts`, `.agents/extensions`, `.agents/mcp.json`, `.agents/providers.json`.
- Каждая writable task запускается в отдельном git worktree.

### 1.5. Хранение

Backend хранит:

- projects;
- chats;
- tasks;
- task runs;
- events;
- Pi session file references;
- checkpoints;
- patches;
- package installs;
- provider configs;
- encrypted secret refs;
- UI themes.

MVP может использовать SQLite. Production-ready вариант должен быть переносим на Postgres.

## 2. Основные доменные сущности

### 2.1. Project

Project — рабочее пространство пользователя.

Поля:

- `id`;
- `name`;
- `repoPath`;
- `defaultBranch`;
- `agentsDir = ".agents"`;
- `runtimeStatePath`;
- `defaultModelId`;
- `themeId`;
- `createdAt`, `updatedAt`.

Требования:

- Может иметь несколько chats.
- Может иметь несколько tasks.
- Имеет `.agents` конфигурацию.
- Может содержать код, Markdown vault или оба типа файлов.

### 2.2. Chat

Chat — пользовательская conversational thread.

Поля:

- `id`;
- `projectId`;
- `title`;
- `mode`;
- `activeTaskId?`;
- `activePiSessionId?`;
- `createdAt`, `updatedAt`.

Требования:

- Chat может быть discussion/planning без writable task.
- Chat может иметь active implementation task.
- Chat может быть orchestration chat, наблюдающим несколько tasks.
- Chat projection должен восстанавливаться из app event log + Pi JSONL.

### 2.3. Task

Task — изолированная исполняемая единица работы.

Поля:

- `id`;
- `projectId`;
- `sourceChatId`;
- `title`;
- `mode`;
- `status`;
- `baseBranch`;
- `baseSha`;
- `branchName`;
- `worktreePath`;
- `piSessionPath`;
- `mergeTarget`;
- `createdAt`, `updatedAt`.

Требования:

- Writable task всегда имеет отдельный git branch + worktree.
- Один task не может иметь два активных Pi runtime одновременно.
- Fork task создаёт новый task + новый worktree + новый Pi session file.
- Rollback по умолчанию создаёт новую task, а не разрушает старую.

### 2.4. Event

Event — append-only запись для UI/realtime/audit.

Типы:

- `message.created`;
- `message.delta`;
- `message.completed`;
- `run.started`;
- `run.completed`;
- `run.aborted`;
- `run.error`;
- `tool.started`;
- `tool.output`;
- `tool.completed`;
- `queue.updated`;
- `checkpoint.created`;
- `diff.updated`;
- `task.status.changed`;
- `merge.started`;
- `merge.completed`;
- `merge.conflict`;
- `package.installed`;
- `provider.updated`.

Требования:

- Event stream должен поддерживать resume по `afterEventId`.
- UI должен уметь восстановиться после reconnect.
- События должны быть пригодны для replay projection.

## 3. Режимы работы

### 3.1. Discussion

- Read-only.
- Без записи в файлы.
- Инструменты: read/search/list.
- Цель: обсуждение, анализ, объяснение.

### 3.2. Planning

- Read-only по умолчанию.
- Может создавать plan artifacts только после approve.
- Цель: план, decomposition, risks, acceptance criteria.

### 3.3. Implementation

- Writable.
- Всегда создаёт task worktree.
- Имеет checkpoint до и после каждого completed turn.
- Показывает diff.
- Merge только через explicit action.

### 3.4. Orchestration

- Не пишет файлы напрямую.
- Может создавать tasks, fork, inspect, request review, merge с подтверждением.
- Показывает aggregate status параллельных tasks.

## 4. Очередь запросов

В composer должны быть режимы отправки:

1. `Send` — отправить, когда task idle.
2. `Follow up` — поставить после текущего run.
3. `Steer` — уточнить текущий run без прерывания.
4. `Abort & replace` — остановить текущий run и заменить запрос.
5. `Abort` — только остановить.

Проверки:

- Во время running state обычный `Send` не должен случайно создавать второй concurrent run в той же task.
- `Steer` доступен только когда task running.
- `Follow up` виден, если task running или queued.
- `Abort & replace` создаёт событие `run.aborted`, затем новый `run.started`.

## 5. Worktree policy

- Main checkout не используется для agent writes.
- Каждая implementation/knowledge-write/refactor task получает branch `agents/task/<taskId>`.
- Worktree создаётся автоматически.
- Merge в main/dev target делается quick action `Слить в repo`.
- По умолчанию merge strategy — squash merge.
- Активная task не ребейзится автоматически.
- Если target branch изменился, task получает state `stale` и кнопку `Rebase from target`.

## 6. Fork/Rollback

### Fork

Fork из chat/task создаёт:

- новый chat;
- новый task, если fork из writable context;
- новый branch;
- новый worktree;
- новый Pi session file, связанный с выбранным Pi entry/checkpoint.

### Rollback

Rollback по умолчанию:

- не делает destructive reset;
- создаёт новую task от выбранного checkpoint;
- сохраняет старую task как archived/abandoned/active по выбору пользователя.

## 7. Quick actions

Quick actions должны отображаться на основании context:

- `Улучшить` / `Улучшить debounce`;
- `Commit`;
- `Тесты`;
- `Review diff`;
- `Слить в repo`;
- `Fork from here`;
- `Rollback`;
- `Apply skill`;
- `Create skill from chat`;
- `Install provider plugin`;
- `Open VSCode Web`;
- `Open Obsidian`.

Каждая action должна иметь:

- `id`;
- `label`;
- `icon`;
- `visibleWhen`;
- `enabledWhen`;
- `requiresConfirmation`;
- `effect.type`;
- `acceptanceCheck`.

## 8. Pi session sync

Требования:

- App chat должен отображать Pi session entries.
- Pi JSONL — durable transcript для Pi resume.
- App event log — durable realtime/audit projection для UI.
- Backend должен уметь import/tail Pi JSONL, чтобы продолжить работу после Pi CLI.
- Одновременная запись в один Pi session file из web runtime и CLI запрещена lock-механизмом.

## 9. Package/plugin manager

Требования:

- Установка Pi package через web UI.
- Sources: npm, git URL, local upload/path.
- Перед активацией показывать resources package: extensions, skills, prompts, themes, providers.
- Package extension code считается небезопасным до explicit trust.
- Установка в `.agents/packages/<name>@<version>`.
- Lock file: `.agents/packages.lock.json`.
- Active tasks не должны hot-load plugin code без явного restart/reload.

## 10. Provider/MCP settings

Требования:

- Управление providers через UI.
- Поддержка OpenAI-compatible custom endpoint.
- Поддержка Pi custom provider plugin.
- Секреты не пишутся в `.agents` и не попадают в session export.
- MCP servers на project-level и user-level.

## 11. Design requirements

Дизайн должен следовать приложенному reference:

- Светлый фон.
- Белые agent bubbles.
- Фиолетовый user bubble.
- Tool card с зелёным diff preview.
- Нижняя fixed action bar.
- Quick action chips над composer.
- Composer с attach слева и send справа.
- Tool calls collapsed by default, expandable.

## 12. Non-functional requirements

- TypeScript strict без ошибок.
- Mobile-first layout.
- Web layout с adaptive right panel.
- Reconnect/replay для event stream.
- Unit tests для reducers/state machines.
- Component tests для critical screens.
- Smoke E2E для main flows.
- Accessibility labels для интерактивных элементов.
- Secrets redaction в logs/traces.
