# Pi Agents Mobile/Web

Кроссплатформенный клиент для работы с LLM-агентом через Web, Android и iOS.
Репозиторий содержит Expo/React Native приложение, Hono API и общие типизированные
контракты. Записи агента всегда изолированы: `Task = branch + worktree + Pi
session + event stream + checkpoints`.

## Состояние проекта

- **Mobile/Web:** Expo SDK 57, React Native 0.86, TypeScript, MobX.
- **Навигация:** явный React Navigation native stack и централизованный registry в
  `apps/mobile/src/navigation/`, без файловой навигации Expo Router.
- **API:** Hono, SQLite, SSE, общие Zod-схемы и machine-readable API registry.
- **Agent runtime:** локальный Pi CLI запускается на backend через `AgentRuntime`;
  для разработки доступен детерминированный `fake` runtime.
- **Git workflow:** реальные worktree, persistent Pi sessions, checkpoint, fork,
  rollback, rebase/stale detection и squash/no-ff merge.

Детальный статус и оставшиеся ограничения: `docs/IMPLEMENTATION-STATUS.md`.

## Требования

- Node.js 24+.
- pnpm 9.15.1 (`corepack enable`).
- Git в `PATH`.
- Для реальных agent turns: локальный Pi CLI и его авторизация.
- Для запуска на Android/iOS: Expo Go либо локальная native-сборка.

## Установка и проверка

```powershell
pnpm install --frozen-lockfile
pnpm -r typecheck
pnpm -r test
pnpm -r lint
```

`lint` является блокирующим CI gate. В нём пока есть предупреждения legacy-кода,
но нет ошибок.

`pnpm export:web` проверен и в Linux CI, и локально на Windows. Файл `.npmrc`
держит pnpm virtual store внутри workspace (`node_modules/.pnpm`): это исключает
абсолютные Windows-пути в asset names Expo и делает static export воспроизводимым.

## Локальный запуск

```powershell
# Backend с безопасной детерминированной реализацией агента.
pnpm dev:api

# Web-клиент.
pnpm dev:web
```

В приложении откройте `/setup`, задайте API URL и проверьте соединение. На Web
явная навигация синхронизирует route с адресной строкой; на iOS/Android тот же
route registry преобразуется в native stack.

### Локальный Pi

`apps/api/.env.example` содержит шаблон. В PowerShell:

```powershell
$env:AGENT_RUNTIME = 'pi'
$env:PI_BIN = 'pi.cmd'
$env:PI_PROVIDER = '' # optional
$env:PI_MODEL = ''    # optional
pnpm dev:api
```

Первый запуск Pi может занять заметное время. Для implementation-задачи runtime
получает именно task worktree и persistent session path; общий checkout не
выдаётся агенту для записи.

## Настройки API

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8787` | HTTP port. |
| `API_HOST` | `127.0.0.1` | Standalone bind address. Set a specific Tailnet IP to reach it from a trusted device. |
| `DB_PATH` | `.data/app.db` (relative to `apps/api`) | SQLite database path. |
| `AGENT_RUNTIME` | `fake` | `fake` or `pi`. |
| `PI_BIN` | from `PATH` | Pi CLI command available to backend. |
| `PI_PROVIDER` / `PI_MODEL` | Pi default | Optional provider/model selection. |
| `CORS_ORIGINS` | empty in development | Comma-separated allowed browser origins. Required in production. |
| `MAX_BODY_BYTES` | `1048576` | Maximum HTTP request body size. |
| `PACKAGE_RESOLVE_RATE_LIMIT` | `10` | Per-client requests allowed for package resolution per time window. |
| `PACKAGE_RESOLVE_RATE_WINDOW_SECONDS` | `60` | Package-resolution rate-limit window. |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-For` only when a reverse proxy overwrites it. |
| `DISK_WARNING_FREE_BYTES` | `1073741824` | Free-space threshold for a structured API warning near `DB_PATH`. |
| `DISK_CHECK_INTERVAL_SECONDS` | `300` | Interval for the API storage-capacity check. |

`NODE_ENV=production` without `CORS_ORIGINS` deliberately prevents API startup.
Use full origins only, for example
`https://chat.tailnet.ts.net,http://100.116.45.50:8092`; paths are rejected.
`POST /packages/resolve` is limited per client and returns `429` with
`Retry-After`; this is a per-process limiter and must be replaced with shared
storage before running several API replicas.
The API emits JSON lifecycle logs, checks storage adjacent to `DB_PATH`, and
handles `SIGINT`/`SIGTERM` by closing the listener before exit.

## Backup and staging restore

```powershell
# Creates SQLite snapshot, approved .agents/runtime files, Git refs and SHA-256 manifest.
pnpm --filter @pi-agents/api backup D:\Backups\pi-agents\2026-07-11

# Refuses a non-empty target and verifies every manifest hash before copying.
pnpm --filter @pi-agents/api restore D:\Backups\pi-agents\2026-07-11 D:\Restore\pi-agents
```

The restore command is deliberately staging-only: it does not overwrite source
repositories or rebind project paths in SQLite. To activate a staged recovery,
prepare clean Git checkouts that already contain the exact task branch commits
recorded in the backup, then provide explicit project mappings:

```json
[
  {
    "projectId": "project-id-from-database",
    "repoPath": "D:/Repos/restored-project",
    "runtimeStatePath": "D:/PiAgentsRuntime/restored-project"
  }
]
```

```powershell
pnpm --filter @pi-agents/api restore:activate D:\Restore\pi-agents D:\Restore\project-mappings.json
```

Activation refuses existing runtime or `.agents` directories, validates every
restorable task branch against the backed-up SHA, recreates worktrees and clears
stale Pi locks before rebinding the staged SQLite paths. It does not clone,
fetch or overwrite Git repositories. Backup excludes `.env`, credentials,
`auth.json`, private-key files, `.git`, `node_modules` and task worktree files.

## Docker / VPS

The repository contains a production-oriented API compose file. It persists
SQLite in a named volume, mounts managed Git repositories separately, runs Git
inside the container and keeps the HTTP port bound to localhost by default.

```powershell
Copy-Item .env.docker.example .env.docker
# Set CORS_ORIGINS and PROJECTS_ROOT in .env.docker.
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker logs -f api
```

To expose API to an authenticated Tailnet device, set `API_BIND_ADDRESS` to the
host Tailscale IP and include the Web origin in `CORS_ORIGINS`. Do not expose
the unauthenticated API to the public internet. The supplied image runs the
fake runtime by default. `AGENT_RUNTIME=pi` requires the Pi CLI to be installed
inside a derived image and `PI_BIN` to point to that executable.

## Architecture

```text
React Native Web / Android / iOS
  explicit React Navigation + MobX RootStore
                 |
                 | typed ApiClient + SSE
                 v
Hono API + SQLite + shared Zod contracts
                 |
                 v
Task worktree + AgentRuntime (Pi or fake) + event stream
```

The contract registry in `packages/contracts/src/apiOperations.ts` connects
client operations with Hono route modules. API parity tests prevent a client
operation from silently losing its server route.

## Limitations

- Authentication and pairing are intentionally postponed; the current backend
  is suitable only for a trusted local/Tailnet environment.
- Provider connection tests and package resolution are still local/synthetic;
  provider secrets are not yet stored by the backend.
- MCP configuration is persisted, but validation deliberately does not execute
  arbitrary commands.
- Docker compose structure is validated; image build/run requires a running
  Docker engine on the host.
- Device-level QA and a complete browser-to-Pi end-to-end flow remain final
  release gates.

See `docs/TESTING-GAPS.md` for the test-boundary inventory.
