# Рабочая заметка: chat-pi

Дата обновления: 2026-07-14.

## Каноническое место работы

- Основной checkout: `D:\chat-pi`.
- Репозиторий: `https://github.com/nicolay-i/chat-pi.git`, ветка `main`.
- Базовый проверенный commit: `28533c0`; актуальную ревизию смотреть через
  `git log -1 --oneline`.
- Не работать из `D:\Documents\ProjectsPet\chat-pi`: это отдельный устаревший checkout.

## Что уже работает

- React Native/Expo клиент для Web, Android и iOS с MobX `RootStore` и явной навигацией.
- Hono API, SQLite, общие Zod-контракты и проверка API parity.
- На VPS: Git checkout, task worktrees, persistent Pi sessions, checkpoints,
  rollback/fork/sync и OpenCode Go через Pi/bubblewrap.
- Tailnet Web-клиент: `https://chat-pi.tail6421db.ts.net`.
- Ignis `0.8.8` с vault только для `chat-pi`:
  `https://chat-pi.tail6421db.ts.net:8443`.
- Web-route Obsidian показывает `Open Ignis` и открывает vault верхнеуровневой
  страницей. Встраивание Ignis в cross-origin iframe не поддерживается upstream
  Obsidian: он читает top-level parent. Android/iOS используют нативный WebView.
- API и Ignis на VPS healthy. Доступ остаётся только внутри Tailnet, без auth.

## Рабочие команды

```powershell
Set-Location D:\chat-pi
git pull --ff-only
corepack pnpm typecheck
corepack pnpm test
corepack pnpm lint
corepack pnpm export:web
```

```powershell
ssh chat-pi 'bash /srv/chat-pi/scripts/deploy-vps.sh'
```

Секреты живут только в защищённом `/srv/chat-pi/.env.docker`; не читать и не
коммитить этот файл.

## Ignis и Git

Ignis хранит собственные `.obsidian/` настройки и временный `.OBSIDIANTEST`
в vault. `scripts/ignore-ignis-vault-state.sh` добавляет их в local Git exclude
managed clone, поэтому они сохраняются для Ignis, но не загрязняют Git status.
`deploy-vps.sh` запускает этот helper автоматически.

## Последняя проверка

- Mobile typecheck и Web export прошли.
- Целевые тесты `IgnisFrame.native` и маршрута Obsidian прошли.
- Browser e2e: проектный маршрут -> `Open Ignis` -> реальный vault `chat-pi`,
  `Server: Connected`, ошибок консоли нет.
- Contracts: 16 passed. API: 206 passed, 2 skipped.
- Полный `pnpm test` однажды дал timeout существующего `ChatScreen` теста при
  одновременном тяжёлом API-прогоне. Его нужно повторить изолированно; если он
  проходит, стабилизировать root test-команду последовательным запуском.

## Открытые release gates

- Полный edit в Ignis после завершённой Task.
- Физическая Android/iOS QA и production signing.
- Внешняя авторизация намеренно вне текущего Tailnet-only scope.
- Рассмотреть custom seccomp вместо текущего `unconfined` профиля для bwrap.

Подробный статус и gaps: `docs/IMPLEMENTATION-STATUS.md`,
`docs/TESTING-GAPS.md`, нормативный план: `plans/2.md`.
