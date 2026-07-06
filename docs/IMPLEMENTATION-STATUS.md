# Implementation status

Карта соответствия «задача манифеста → фактическая реализация» по всем 33 задачам
(`.agents/tasks/manifest.json`: T00–T22, B00–B08). Статус всех задач — **done**
(см. `.agents/status.json` и `git log --oneline` — каждый commits помечен
`feat(<task-id>)`).

Расхождения со спекой зафиксированы в последнем разделе.

---

## Frontend (mobile)

| ID    | Title                              | Status | Key files (under `app-starter/`) |
| ----- | ---------------------------------- | ------ | -------------------------------- |
| T00   | Bootstrap React Native project     | ✅ done | `app/_layout.tsx`, `package.json`, `tsconfig.json`, `app.json` |
| T01   | Monorepo tooling and contracts     | ✅ done | `packages/contracts/src/`, `pnpm-workspace.yaml`, root `package.json` scripts |
| T02   | Design system from reference       | ✅ done | `src/components/chat/{MessageBubble,ToolCard,QuickActionChip,Composer,DiffPreview,ChatReferenceScreen}.tsx`, `src/theme/` |
| T03   | Navigation shell                   | ✅ done | `app/` (22 файла маршрутов), `src/components/shell/{Placeholder,ProjectWebShell}.tsx` |
| T04   | API client and schemas             | ✅ done | `packages/contracts/src/schemas.ts`, `src/api/client.ts` (~40 методов, `ApiClientError`) |
| T05   | Realtime event stream              | ✅ done | `src/api/eventStream.ts`, `src/state/{eventReducer,realtimeClient,RealtimeManager,connectionStore}.*` |
| T06   | Connection setup screen            | ✅ done | `app/setup.tsx`, `src/state/{backendStore,backendStorage}.*` |
| T07   | Projects screens                   | ✅ done | `app/projects/{new.tsx,[projectId]/index.tsx}`, `src/features/projects/` |
| T08   | Chats list and new chat            | ✅ done | `app/projects/[projectId]/chats/{index,new}.tsx`, `src/features/chats/` |
| T09   | Chat thread UI                     | ✅ done | `app/projects/[projectId]/chats/[chatId]/index.tsx`, `src/features/chat/` |
| T10   | Composer queue modes and actions   | ✅ done | `src/components/chat/{Composer.tsx,composerRules.ts}`, `src/features/actions/` |
| T11   | Tasks list and detail              | ✅ done | `app/projects/[projectId]/tasks/{index,[taskId]/index}.tsx`, `src/features/tasks/` |
| T12   | Runtime status and full trace      | ✅ done | `app/projects/[projectId]/chats/[chatId]/trace.tsx`, `src/features/trace/` |
| T13   | Diff review                        | ✅ done | `app/projects/[projectId]/tasks/[taskId]/diff.tsx`, `src/features/diff/` |
| T14   | Merge flow                         | ✅ done | `app/projects/[projectId]/tasks/[taskId]/{merge,conflicts}.tsx`, `src/features/merge/` |
| T15   | Checkpoints, fork, rollback        | ✅ done | `app/projects/[projectId]/tasks/[taskId]/checkpoints.tsx`, `src/features/checkpoints/` |
| T16   | File browser and Markdown viewer   | ✅ done | `app/projects/[projectId]/{files.tsx,files/}`, `src/features/files/` |
| T17   | Skills, prompts, actions           | ✅ done | `app/projects/[projectId]/settings/{skills,prompts}.tsx` (+ subdirs), `src/features/{skills,actions}/` |
| T18   | Providers, MCP, packages           | ✅ done | `app/projects/[projectId]/settings/{providers,mcp,packages}.tsx`, `src/features/settings/` |
| T19   | Theme editor                       | ✅ done | `app/projects/[projectId]/settings/theme.tsx`, `src/features/theme/`, `src/theme/themeStore` |
| T20   | Offline, notifications, settings   | ✅ done | `src/state/connectionStore.*`, `app/{approvals,settings}.tsx`, `OfflineBanner` в `_layout.tsx` |
| T21   | Tests, CI, accessibility pass      | ✅ done | `.github/workflows/ci.yml`, `src/components/__tests__/accessibility.test.tsx`, `docs/TESTING-GAPS.md` |
| T22   | Documentation handoff              | ✅ done | `README.md`, `docs/IMPLEMENTATION-STATUS.md`, `.agents/{tasks/index.md,status.json}` |

---

## Backend (api)

| ID    | Title                              | Status | Key files (under `api-starter/src/`) |
| ----- | ---------------------------------- | ------ | ------------------------------------- |
| B00   | Hono API bootstrap                 | ✅ done | `index.ts`, `server.ts`, `config.ts` (`/health`, `/api/capabilities`) |
| B01   | DB schema and repositories         | ✅ done | `db/{db,migrations}.ts` (8 таблиц), `db/repositories/{projects,chats,tasks,events,pi_sessions,checkpoints,packages,providers}Repository.ts` |
| B02   | Project/chat/task services         | ✅ done | `services/{projectService,chatService,taskService,taskStatus}.ts` (status-transition validation) |
| B03   | Git worktree manager               | ✅ done | `services/{gitExec,gitWorktreeService}.ts` (child_process, real git) |
| B04   | Pi runtime wrapper                 | ✅ done | `services/{piRuntimeService,runtimeManager}.ts` (`FakePiRuntime`, per-session locks, `PiRuntimeAdapter` stub) |
| B05   | Event store and realtime           | ✅ done | `realtime/{eventStore,sse}.ts`, DB-backed SSE с `?after=` resume |
| B06   | Pi session sync                    | ✅ done | `services/{piJsonl,sessionSyncService}.ts`, `db/repositories/piSessionsRepository.ts` (entry-id dedupe, `SessionLockError`) |
| B07   | Actions, skills, packages, providers | ✅ done | `services/{actionEngine,skillRunner,packageService,providerService}.ts` (trust-gating, secret redaction) |
| B08   | Checkpoint/merge/fork/rollback     | ✅ done | `services/{checkpointService,forkService,rollbackService,mergeService}.ts` (squash/no-ff merge на реальном git) |

---

## Расхождения со спекой

Эти решения приняты осознанно в ходе реализации; зафиксированы, чтобы
документация не расходилась с кодом.

1. **Имена директорий.** В `manifest.json` упоминаются `apps/mobile` и `apps/api`
   (например в `inputs` для T01). Фактически рабочие пакеты расположены в
   `app-starter/` (имя пакета `mobile`) и `api-starter/` (имя пакета `api`).
   `pnpm-workspace.yaml` явно перечисляет оба. Функционально эквивалентно спеке.

2. **`node:sqlite` вместо `better-sqlite3`.** Выбран встроенный в Node 24
   модуль `node:sqlite`, чтобы избавиться от native-сборки на Windows и
   упростить CI. Платой является экспериментальный статус API
   (косметическое `ExperimentalWarning` в консоли — не блокирует работу).
   См. `api-starter/src/db/db.ts`.

3. **Pi runtime — Fake / stub.** Реального бинарника Pi в репозитории нет.
   `FakePiRuntime` эмитирует последовательность run/tool/message событий;
   `PiRuntimeAdapter` оставлен как явная заглушка под будущий Pi CLI.
   `RuntimeManager` обеспечивает per-session lock + persist статусов — логика
   готова к подключению реального адаптера без переписывания сервисов выше.

4. **`providerService` и `packageService`.** "Test connection" и
   resolve/install пакетов — стабы (mocked transport). Trust-gating и
   redaction секретов реализованы полностью; реальный сетевой обмен
   отложен до интеграции с реальными провайдерами/registry.

5. **WebSocket realtime path.** Стаб, end-to-end не покрывается. Рабочая и
   протестированная realtime-линия — SSE с resume по `?after=<event_id>`.

Полный список лакун покрытия автотестами — `docs/TESTING-GAPS.md`.
