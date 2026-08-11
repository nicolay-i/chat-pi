# Рабочая заметка: chat-pi

Дата обновления: 2026-08-11.

## Каноническое место работы

- Основной checkout: `D:\chat-pi`.
- Репозиторий: `https://github.com/nicolay-i/chat-pi.git`, ветка `main`.
- Базовый проверенный commit: `325be26`; актуальную ревизию смотреть через
  `git log -1 --oneline`.
- Не работать из `D:\Documents\ProjectsPet\chat-pi`: это отдельный устаревший checkout.

## Цели текущего этапа

1. Поддержать несколько независимых backend-узлов: локальный компьютер, VPS и
   другие доверенные компьютеры, подключённые через HTTPS/Tailscale.
2. Выдавать каждому узлу стабильный `serverId`, сохраняемый при перезапуске и
   отличающий независимые установки/восстановления.
3. Привязать каждый Project к узлу-владельцу, а Chat, Task, PiSession и события
   — наследовать эту привязку без неявного переноса.
4. Квалифицировать все API-команды и SSE/replay-потоки по `serverId`, чтобы
   одинаковые локальные ID на разных узлах не смешивались.
5. Сохранить одновременную работу с Chat на разных компьютерах: активный узел
   в UI не должен менять endpoint уже открытого Chat.
6. Дать клиентский реестр подключений: добавить, переименовать, проверить,
   выбрать и удалить узел без удаления данных на самом компьютере.
7. Агрегировать проекты доступных узлов, показывать владельца и задержку, а при
   потере одного узла сохранять его последний снимок с явным offline-статусом.
8. После авторизации/восстановления открывать `/projects`; корневой `/` не
   должен создавать Chat или сохранять новую ссылку на backend вместо Projects.
9. Поддержать server-qualified deep links и обратную миграцию старого одиночного
   `baseUrl`, чтобы ссылка однозначно восстанавливала узел, Project и Chat.
10. Использовать стабильные HTTPS/Tailscale URL, корректный CORS и не допускать
    mixed-content/private-network блокировок для установленной PWA.
11. Не запускать Linux `bwrap` на Windows: требовать WSL2/Linux либо явно
    включённый ограниченный trusted runtime без sandbox.
12. Довести Web-интерфейс до desktop/tablet/mobile: клавиатура, мышь, focus,
    отсутствие критичного горизонтального overflow и доступный composer.
13. Довести PWA и credentials: manifest, service worker/update flow, drafts,
    node bearer token, SecureStore на native и memory-only token на Web.
14. Подтвердить реальными сценариями два узла (локальный ПК + VPS), независимые
    SSE/run и восстановление после потери связи, затем обновить docs, commit и
    VPS deployment.

## Что уже работает

- React Native/Expo клиент для Web, Android и iOS с MobX `RootStore` и явной навигацией.
- После сохранения backend приложение открывает список проектов. Корневой `/`
  ждёт восстановления сохранённого URL и направляет в `/projects`; без URL
  открывается `/setup`. Подключение больше не создаёт и не открывает Chat само.
- Web shell проекта адаптирован для трёх классов экранов. На телефоне при
  ширине меньше 720 px навигация становится горизонтальной; на планшете
  используется компактная боковая панель 196 px; на десктопе — панель 232 px
  и ограниченная рабочая область до 1180 px. Пустая правая context-панель
  удалена. Список проектов на ширине от 1024 px раскладывается в две колонки.
  Мобильная полоса навигации остаётся высотой 48 px.
- В Chat доступна сохранённая очередь follow-up сообщений: её можно раскрыть,
  переставить элементы, удалить отдельное сообщение или очистить целиком после
  явного подтверждения. Изменения публикуют `queue.updated`, поэтому счётчик
  синхронизируется через SSE и после удаления, и после очистки.
- На overview Task доступны реальные lifecycle-действия с подтверждением:
  Abort с сохранением worktree, rollback к последнему checkpoint, fork,
  rebase, отмена с архивированием и отмена с удалением worktree. Во время
  запуска Git/cancel-действия заблокированы; после terminal-статуса остаются
  только безопасные операции над историей fork/rollback.
- Hono API, SQLite, общие Zod-контракты и проверка API parity.
- Удаление проекта атомарно очищает связанные Chat events, очередь, checkpoints,
  Tasks, Pi sessions, runtime audit, packages и providers; история очереди
  больше не вызывает `FOREIGN KEY constraint failed`.
- Project Settings содержит explicit remote sync: read-only inspect показывает
  local/remote SHA и stale Tasks, а fast-forward появляется отдельной кнопкой
  и требует подтверждения. Фонового обновления primary checkout нет.
- На VPS: Git checkout, task worktrees, persistent Pi sessions, checkpoints,
  rollback/fork/sync и OpenCode Go через Pi/bubblewrap.
- Tailnet Web-клиент: `https://chat-pi.tail6421db.ts.net`.
- VPS CORS allowlist включает собственный Web-origin
  `https://chat-pi.tail6421db.ts.net` и локальный Tailscale Web-origin
  `https://homemi.tail6421db.ts.net`; посторонний Origin не получает
  `access-control-allow-origin`.
- Ignis `0.8.8` с vault только для `chat-pi`:
  `https://chat-pi.tail6421db.ts.net:8443`.
- Web-route Obsidian показывает `Open Ignis` и открывает vault верхнеуровневой
  страницей. Встраивание Ignis в cross-origin iframe не поддерживается upstream
  Obsidian: он читает top-level parent. Android/iOS используют нативный WebView.
- Текущий Android release-вариант после подключения к сохранённому VPS URL
  открывает `/projects`, а не Chat. На Pixel 3a API 34 при открытой клавиатуре
  composer, поле сообщения и кнопки режима отправки остаются видимыми и
  интерактивными; проверен ввод `keyboard-check`.
- API и Ignis на VPS healthy. Доступ остаётся только внутри Tailnet, без auth.

## Реализовано в текущем рабочем дереве

- Backend получает стабильный UUID `serverId` через `/api/capabilities`; при
  наличии `PI_AGENT_DIR` идентификатор сохраняется в `server-id`.
- Клиент хранит реестр нескольких подключений, мигрирует старый `baseUrl`,
  показывает `/servers` и агрегирует проекты всех доступных компьютеров.
- Project/Chat/Task и realtime-подписки квалифицируются по `serverId`; смена
  выбранного компьютера не переводит уже открытый Chat на другой endpoint.
- Поддерживаются server-qualified ссылки вида
  `/servers/<serverId>/projects/<projectId>/chats/<chatId>` и прежний query-
  формат `?serverId=...`.
- Web export копирует manifest, icon и service worker в `dist`; PWA показывает
  install/update UI при поддержке браузера и сохраняет черновик Chat в Web
  Storage.
- Узел может включить bearer-защиту через `PI_AUTH_TOKEN` или
  `PI_AUTH_TOKEN_FILE`; discovery остаётся публичным, API/SSE проверяют
  `Authorization`. Native credentials идут в SecureStore, Web credentials не
  попадают в localStorage.
- При недоступности одного узла его последний список проектов не стирается и
  помечается `offline`; ошибка токена отображается отдельно как `нужен токен`.
- Windows guard запрещает `AGENT_RUNTIME=pi` вместе с Linux `bwrap` и требует
  явный `PI_TRUSTED_MODE=true` для unsandboxed Pi.
- Android keyboard layout для Expo зафиксирован как `resize` в `app.json`, а
  Chat дополнительно учитывает фактическую высоту IME через native keyboard
  events. Это сохраняет composer доступным и в edge-to-edge режиме Android.

## Осталось подтвердить или реализовать

- Полный содержательный VPS Pi-сценарий (provider сейчас отвечает
  `401 AuthError`) и фактическая установка/standalone/update PWA остаются
  release gates. Одновременная регистрация HTTPS-узлов, UI-изоляция,
  независимые Task/SSE, потеря локального узла и продолжение работы VPS уже
  проверены вручную.
- Установка/standalone/update PWA в Chromium/Edge; desktop/tablet/mobile
  ручной проход уже выполнен, но не является CI-проверкой.
- Полноценные pairing/login/token rotation и безопасные credentials для общего
  интернета; сейчас допустим только Tailnet-only HTTPS, node bearer является
  базовой защитой узла, а не пользовательской авторизацией.
- Отдельная production-изоляция Pi на Windows (WSL2/контейнер либо явно
  доверенный режим); Linux `bwrap` на Windows не работает.
- Целевая архитектура и критерии приёмки собраны в `docs/13-multi-server-pwa.md`.

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

- В Chromium проверены desktop `1440x900`, tablet landscape `1024x768`, tablet
  portrait `768x1024` и контрольный mobile `390x844`. Dashboard и Chat не имеют
  document-level горизонтального переполнения; боковая навигация, очередь,
  composer и меню режима отправки остаются доступными. На мобильном dashboard
  действие Settings перенесено на отдельную строку и не пересекается с длинным
  именем проекта.
- Полные monorepo `typecheck` и тесты прошли: Contracts 16, API 216 passed + 2
  skipped, Mobile 262. Mobile lint завершился без ошибок, но со 103
  предупреждениями (в основном существующие правила для тестов и эффектов).
- API config guard фактически проверен тестами: на Windows `pi+bwrap`
  отклоняется с требованием WSL2/Linux-контейнера, а native `pi+none` требует
  явного `PI_TRUSTED_MODE=true`; `fake` остаётся отдельным режимом smoke.
- В Chromium при viewport `390x844` проверены 25 маршрутов: `/`, проекты,
  создание проекта, dashboard, actions, файлы и просмотр файла, Obsidian,
  список/создание/экран Chat, chat actions/trace/tree, задачи, все проектные
  настройки, approvals и общие settings. На рабочих маршрутах нет
  горизонтального переполнения и ошибок консоли.
- Через интерфейс создан реальный локальный проект, создан Chat и отправлено
  сообщение с ответом fake runtime; переходы в settings и approvals и их
  основные действия выполнены в мобильном viewport. Повторное открытие `/`
  с сохранённым backend URL привело в `/projects`.
- Обычный implementation Chat без активной Task теперь показывает явную форму
  создания следующей Task в том же Chat. Реальный Chromium `390x844` создал её
  через эту форму; заголовок сразу получил новый `activeTaskId`, backend сохранил
  прежние Chat и PiSession, а новая Task получила отдельный чистый worktree.
- Отдельным реальным проходом в Chromium `390x844` открыта наполненная очередь
  из двух сообщений: порядок изменён, одно сообщение удалено, оставшееся
  очищено после подтверждения. Счётчик в заголовке последовательно изменился
  `2 -> 1 -> 0`; ошибок консоли нет. Во время этого прохода обнаружена и
  исправлена лишняя высота мобильной панели навигации.
- Изолированный `ChatScreen` прошёл: 6 passed.
- Изолированный Task detail прошёл: 4 passed. В реальном Chromium `390x844`
  временная implementation Task была отменена через подтверждение с режимом
  archive; экран обновился до `cancelled_archived`, а после reload повторные
  cancel/rebase остались disabled.
- В отдельном Chromium-проходе `390x844` временный Git-проект дал настоящие
  Task worktree, checkpoint, незакоммиченный diff и fake-runtime events.
  Фактически открыты и проверены Overview, Diff (два файла и patch),
  Checkpoints, checkpoint diff, подтверждения Fork/Rollback, Merge в состояниях
  `created` и `needs_review`, а также Message detail и Tool call detail по
  реальным event ID. Ошибок консоли на этих экранах нет.
- Затем Merge фактически выполнен из Chromium `390x844`: интерфейс предложил
  только нормативную стратегию Squash, показал отдельное подтверждение и
  завершился экраном `Слияние выполнено`. Task получил статус `merged`, SHA в
  API совпал с HEAD чистого основного checkout, коммит имел одного родителя и
  содержал ровно проверочный файл. Первый прогон выявил и исправил рассинхрон
  контракта: API возвращал `{ mergedSha }`, хотя типизированный клиент ожидал
  Task; endpoint теперь возвращает обновлённую Task. Не-squash запросы получают
  400 без изменения `needs_review`, а грязный основной checkout также оставляет
  Task доступной для повторной попытки, не переводя её в `merge_conflict`.
- Обнаруженный в этом проходе рассинхрон `Changed files: 0` при непустом Diff
  исправлен в публичных Task detail/list API: summary теперь считается тем же
  Git diff-сервисом. Повторная проверка в Chromium `390x844` показала
  `Changed files: 1`, а Diff — ровно один соответствующий `ui-change.txt`.
- Explicit remote sync проверен в реальном Chromium `390x844` на временной
  схеме bare remote + отстающий clone: inspect показал
  `fast_forward_available` и не изменил HEAD; подтверждённый apply дал
  `fast_forward_applied`, сравнял local/remote SHA и оставил checkout clean.
- После изменений auth/status Projects дополнительно визуально проверен в
  Chromium при `1440x900`, `1024x768` и `390x844`. На мобильной ширине заголовок
  и действия Projects перенесены на две строки: кнопка `New` не обрезается
  справа. Web export после правки выполнен повторно.
- Локальный Web export проверен во встроенном Chromium: после сохранения URL
  Setup открыл `/projects`; `/manifest.webmanifest` распознан как
  `display=standalone`, service worker перешёл в `activated` и стал controller
  страницы, а GET `/api/capabilities` вернул 200 через обход service-worker
  shell-кэша. Синтетическое событие `beforeinstallprompt` показало install
  banner, а нажатие кнопки вызвало `prompt()` и убрало banner. Фактическую
  установку отдельного окна и реальный update с сохранением draft браузерная
  среда не предоставляет, поэтому они остаются release gate.
- PWA export теперь подставляет hash экспортированного `index.html` в имя
  service-worker cache; в `dist/sw.js` после сборки нет placeholder. Добавлены
  unit-проверки server-scoped draft storage и durable per-node metadata
  snapshots проектов; при недоступности узла после reload сохраняются только
  project metadata, без credentials, SSE и файлового содержимого.
- VPS runtime был обновлён сборкой из commit `834b299`; документация и Web export
  соответствуют той же ревизии. Через Web по HTTPS одновременно добавлены VPS
  `chat-pi.tail6421db.ts.net` и локальный Windows-узел
  `homemi.tail6421db.ts.net:9443`. `/projects` показал проекты обоих узлов с
  владельцами, а переход в локальный проект сформировал URL
  `/servers/<serverId>/projects/<projectId>?serverId=<serverId>`.
- После остановки локального API `/servers` показал
  `Компьютер недоступен: Failed to fetch`, а `/projects` сохранил рабочие
  проекты VPS и сообщил `1 server connection unavailable`; VPS продолжал
  отвечать независимо.
- Одновременный реальный Task/SSE smoke выполнен на двух узлах: локальный
  fake Task `9c0ba65b-7cc3-4a64-8634-e0e6551c078f` завершился
  `needs_review` и отдал `task.status.changed`, `workspace_context_changed`,
  `run.started`, `tool.*`, `run.completed` и checkpoint-события; VPS Task
  `f8f53413-04f9-4620-96b6-50f06aaedc86` отдал независимый поток с другим
  `streamId`/диапазоном sequence и дошёл до `run.error`/`failed` только из-за
  upstream `401 AuthError` провайдера `opencode-go/deepseek-v4-flash`.
- Для VPS-тестового checkout потребовалось разрешить запись контейнерному
  пользователю `node` (`chmod a+rwX`): исходный mounted checkout был
  root-owned и не позволял создавать ветку/worktree. Это эксплуатационный
  prerequisite для реальных Task на VPS, а не ошибка маршрутизации клиента.
- Во время VPS deploy обнаружился недостаток места: сборка остановилась при
  свободных `1.1 GB`. Удалены только остановленные контейнеры и неиспользуемые
  Docker-образы; после очистки осталось `5.5 GB`, deploy завершился успешно.
- Полный `pnpm test` прошёл при штатном параллельном запуске пакетов:
  Contracts 16 passed; API 216 passed, 2 skipped; Mobile 262 passed.
- Browser e2e: проектный маршрут -> `Open Ignis` -> реальный vault `chat-pi`.
  Проверочная Markdown-заметка была создана через Web, сохранилась после полной
  перезагрузки, повторно открылась с тем же текстом и была подтверждена в
  `/srv/projects/chat-pi`; `Server: Connected`, ошибок консоли нет. Временная
  заметка удалена, managed clone остался clean.

## Открытые release gates

- Полный native Android QA, iOS QA и production signing остаются release gates.
  Текущий standalone release APK собран на Windows с x86_64 workaround
  `-PnewArchEnabled=false -PreactNativeArchitectures=x86_64`, установлен на
  Pixel 3a API 34 и проверен без Metro: сохранённый VPS URL открыл `/projects`,
  а при показанной клавиатуре composer остался видимым. Физический Infinix в
  текущей сессии не подключён, поэтому прежнюю проверку на нём нельзя считать
  свежей репродукцией.
- Conflict UI не проверен на настоящем конфликте: публичный API корректно
  запрещает искусственный переход `needs_review -> merge_conflict`, а текущий
  экран явно сообщает, что встроенное разрешение конфликтов не поддерживается.
  Conflict recovery на мобильном viewport остаётся gate; обычный успешный
  squash Merge через мобильный Web-интерфейс уже подтверждён.
- Approvals пока использует локальные mock-данные; `Skills -> New` и
  `Extract from chat` остаются незавершёнными продуктовыми действиями.
- Внешняя авторизация намеренно вне текущего Tailnet-only scope.
- Рассмотреть custom seccomp вместо текущего `unconfined` профиля для bwrap.

Подробный статус и gaps: `docs/IMPLEMENTATION-STATUS.md`,
`docs/TESTING-GAPS.md`, нормативный план: `plans/2.md`.
