# Pi Agents Mobile/Web

Кроссплатформенный клиент управления LLM-агентом через Web, Android и iOS.
Репозиторий содержит Expo/React Native приложение, Hono API и общие типизированные
контракты. Выполнение находится на VPS: `Chat = одна постоянная PiSession`, а
`Task = branch + worktree + диапазон session entries + checkpoints`.

## Состояние проекта

- **Mobile/Web:** Expo SDK 57, React Native 0.86, TypeScript, MobX.
- **Навигация:** явный React Navigation native stack и централизованный registry в
  `apps/mobile/src/navigation/`, без файловой навигации Expo Router.
- **API:** Hono, SQLite, SSE, общие Zod-схемы и machine-readable API registry.
- **Agent runtime:** Pi, Git, worktrees, session files и checkpoints запускаются
  только Hono backend на VPS. Web/Android/iOS не запускают Pi и не получают
  доступ к файловой системе репозиториев. Для unit-тестов доступен `fake` runtime.
- **Git workflow:** реальные worktree, persistent Pi sessions, checkpoint, fork,
  rollback, rebase/stale detection и squash/no-ff merge.

Детальный статус и оставшиеся ограничения: `docs/IMPLEMENTATION-STATUS.md`.
Проверяемые сценарии из нормативного плана: `docs/ACCEPTANCE-MATRIX.md`.

## Требования

- Node.js 24+.
- pnpm 9.15.1 (`corepack enable`).
- Git в `PATH`.
- Для локального opt-in smoke-теста Pi: CLI и его авторизация. Это не является
  пользовательским execution mode и не заменяет VPS runtime.
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

### Локальный Pi smoke-тест

`apps/api/.env.example` содержит шаблон. В PowerShell:

```powershell
$env:AGENT_RUNTIME = 'pi'
$env:PI_BIN = 'pi.cmd'
$env:PI_PROVIDER = '' # optional
$env:PI_MODEL = ''    # optional
pnpm dev:api
```

Первый запуск Pi может занять заметное время. Этот режим нужен только для
разработки backend и проверки интеграции. В целевой эксплуатации Pi запускается
на VPS; для implementation-задачи он получает task worktree, а discussion и
planning получают основной repo только с read-only tools.

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

The repository contains a VPS-oriented API compose file. It persists SQLite,
Pi agent state and managed Git repositories on the VPS. The container runs Git
and Pi; clients connect only through the Tailnet. The HTTP port remains bound
to localhost by default until a specific Tailnet IP is configured.

In production compose, each Pi child is launched through Linux `bubblewrap`.
The child receives only its Task worktree, the Chat JSONL session directory and
the dedicated Pi state directory; discussion/planning mounts the primary repo
read-only. The API accepts repository paths only below container path
`/projects`, and records each real Pi child PID, cwd, sandbox mode and terminal
status in SQLite. The VPS must permit unprivileged user namespaces. Docker's
default seccomp profile blocks `unshare()`, so the supplied compose file uses
`PI_DOCKER_SECCOMP_PROFILE=unconfined` together with `no-new-privileges` and
all Linux capabilities dropped; replace it with a reviewed custom profile that
permits the bwrap syscalls when one is available. Provider network access
remains enabled, while host networking and the Docker socket are not passed
into the Pi child.

```powershell
Copy-Item .env.docker.example .env.docker
# Set CORS_ORIGINS and PROJECTS_ROOT in .env.docker.
# PROJECTS_ROOT is the host directory mounted inside the API as /projects.
docker compose --env-file .env.docker up --build -d
docker compose --env-file .env.docker logs -f api
```

To expose API to a Tailnet device, set `API_BIND_ADDRESS` to the host Tailscale
IP and include the Web origin in `CORS_ORIGINS`. Do not expose the
unauthenticated API to the public internet. The supplied image already contains
the pinned Pi CLI and runs Pi by default; provider credentials must be
provisioned in `/data/pi-agent` or as the minimal provider-specific environment.
Before accepting a VPS deployment, run a real bwrap Pi turn and confirm its
`runtime_processes` record has `sandbox_mode = 'bwrap'` and a completed status.
After registering the target repository in the application, the containerized
verifier performs that check and discards its temporary Task afterwards:

```powershell
docker compose exec -T -e VERIFY_PROJECT_REPO_PATH=/projects/my-repository api node --import tsx src/scripts/verifyBwrapRuntime.ts
```

The command requires working provider credentials in `/data/pi-agent` (or the
minimal provider environment allowed by `PI_SANDBOX_ENV_ALLOWLIST`). It refuses
paths outside `/projects` and does not create a Project implicitly.

### Deploy from Git

The VPS checkout must be a clean clone of `origin/main`; configuration and
volumes are deliberately not committed. Clone it once, create the protected
`.env.docker`, then use the versioned deployment script for each update:

```bash
git clone https://github.com/nicolay-i/chat-pi.git /srv/chat-pi
cd /srv/chat-pi
cp .env.docker.example .env.docker
# Set CORS_ORIGINS and PROJECTS_ROOT=/srv/projects; keep secrets out of Git.
./scripts/deploy-vps.sh
```

To update the VPS after pushing a commit to `main`, run only:

```bash
cd /srv/chat-pi && ./scripts/deploy-vps.sh
```

The script refuses uncommitted or untracked files in the server checkout and
only accepts a fast-forward from `origin/main`. This keeps deployment state
reproducible from Git while preserving `.env.docker` and Docker volumes.

## Architecture

```text
React Native Web / Android / iOS
  explicit React Navigation + MobX RootStore
                 |
                 | typed ApiClient + SSE
                 v
Hono API on VPS + SQLite + shared Zod contracts
                 |
                 v
one Chat PiSession + task worktree + AgentRuntime (Pi or fake) + event stream
```

The contract registry in `packages/contracts/src/apiOperations.ts` connects
client operations with Hono route modules. API parity tests prevent a client
operation from silently losing its server route.

## Limitations

- Authentication and pairing are intentionally postponed; the current backend
  is suitable only for a trusted Tailnet environment.
- Provider connection tests and package resolution are still local/synthetic;
  provider secrets are not yet stored by the backend.
- MCP configuration is persisted, but validation deliberately does not execute
  arbitrary commands.
- Docker image build, Compose API health and a real OpenCode Go provider-backed
  `bwrap` Pi turn on the Linux VPS are verified.
- Device-level QA remains the final client release gate.

See `docs/TESTING-GAPS.md` for the test-boundary inventory.
