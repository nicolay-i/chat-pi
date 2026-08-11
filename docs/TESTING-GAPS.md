# Пробелы в тестировании

Набор тестов покрывает контракты, интеграцию API-маршрутов и сервисов,
настоящие временные Git-репозитории, MobX-хранилища и мобильные экраны.
Следующие поверхности пока не подтверждены автоматическими тестами и остаются
release gates.

## Сквозной runtime

- В CI нет теста, который одновременно подключает работающий процесс Hono,
  реальный browser bundle и настоящий Pi CLI. В рабочей заметке есть
  исторический Tailnet-only проход Web -> VPS -> bwrap -> OpenCode Go, но
  повторная проверка 2026-08-11 остановилась на upstream `401 AuthError`; для
  текущего состояния нужна воспроизводимая CI-проверка с валидными credentials.
- Реальный Pi-тест запускается отдельно, поскольку зависит от локального CLI,
  аккаунта и доступности модели. Перед релизом, после завершения первого запуска
  Pi, следует выполнить:

  ```powershell
  $env:PI_REAL_E2E = '1'
  pnpm --filter @pi-agents/api test -- src/services/__tests__/piRuntime.test.ts
  ```

- Если используется `PI_AGENT_DIR`, в нём должны находиться credentials
  выбранного provider либо provider должен быть настроен через переменные
  окружения; изолированный каталог намеренно не копирует `~/.pi`.
- SSE-сервер и replay клиента протестированы, но долгоживущая мобильная сессия,
  подключённая к реальному server process, постоянно не проверяется в CI.

## Проверка устройств и визуального отображения

- Standalone Android release-вариант собран на Windows, установлен в эмулятор
  Pixel 3a API 34 и подключён к VPS через Tailnet HTTPS без Metro. С сохранённым
  URL после перезапуска открывается `/projects`, а не Chat.
- В текущей сборке на Pixel 3a открытая Android-клавиатура не закрывает composer:
  поле сообщения, выбор режима и кнопка отправки остаются в UI; выполнен ввод
  `keyboard-check`. В `app.json` зафиксирован режим `resize`, а Chat использует
  IME-inset events как дополнительную защиту для edge-to-edge.
- Физический Infinix в текущей сессии не подключён. Поэтому его прежний ручной
  smoke не заменяет свежую проверку; полный проход native-экранов, iOS QA и
  production signing APK ещё не завершены.
- Экспериментальный provider oRPC-клиент интеграционно протестирован только в
  Node. В Expo bundle он пока не добавлен и на iOS/Android не проверялся.
- Явная remote sync имеет component test и реальный локальный Chromium/Git
  проход fast-forward-сценария. Для diverged/local-ahead состояний и отображения
  stale Task пока нет browser fixtures.
- Нет автоматического screenshot-regression набора для React Native Web,
  тёмной темы и прохода screen reader. Ручные Chromium-проходы покрывают широкий
  набор маршрутов при `390x844` и основной Projects -> Dashboard -> Chat flow при
  `1440x900`, `1024x768`, `768x1024` и `390x844`. На этих viewport не было
  горизонтального переполнения документа или runtime-ошибок, но это всё ещё
  ручное подтверждение, а не CI-проверка.
- VSCode Web не поддерживается. Ignis имеет настроенный Tailnet URL и доступный
  для записи vault `chat-pi`. Web-маршрут открывает Ignis верхнеуровневой
  страницей, потому что upstream Obsidian читает top-level parent и не работает
  в cross-origin iframe. Android/iOS используют нативный WebView. Полное Web-
  редактирование проверено, временная заметка удалена, managed clone остался
  чистым.
- Текущий набор mobile-тестов завершается без предупреждений React `act(...)`.
- Мобильный browser-проход проверил восстановление корневого маршрута, создание
  проекта, навигацию по проекту, создание Chat и отправку сообщения, настройки и
  локальные действия approvals. Отдельный проход проверил очередь Chat: открыть,
  переставить, удалить, подтвердить очистку и получить обновление счётчика через
  SSE. Настоящие временные Git Task проверили lifecycle, Diff, checkpoints,
  Fork/Rollback, Merge, Message и Tool call details.
- Настоящий conflict fixture и мобильное восстановление после конфликта не
  проверены; текущий экран прямо сообщает, что разрешение конфликтов в приложении
  не поддерживается.
- Последовательный Task-сценарий, ранее доступный только через API, проверен из
  интерфейса: implementation Chat без активного Task создал следующий Task,
  обновил active ID и сохранил ту же Chat/PiSession при создании нового чистого
  worktree.
- Approvals работает только с mock-строками. `Skills -> New` ведёт в
  незавершённый detail-сценарий, а `Extract from chat` не имеет backend-действия;
  эти сценарии нельзя считать production-ready.

## Несколько серверов и PWA

- Unit/integration-проверки уже подтверждают scoped resource keys, коллизию
  одинаковых Chat ID на разных узлах, server-qualified deep links, реестр
  нескольких подключений, per-node offline/auth statuses и serverId в
  `/api/capabilities`. API-тесты также проверяют optional bearer и публичный
  discovery.
- Реальный transport/UI smoke локального ПК и VPS выполнен: узлы имели разные
  `serverId`, были одновременно зарегистрированы через HTTPS/Tailscale,
  `/projects` показал owner-qualified карточки, а deep link локального проекта
  содержал `serverId` и `projectId`. Параллельные Task-запуски дали независимые
  SSE `streamId` и sequence ranges; после остановки локального API `/servers`
  показал `Компьютер недоступен`, а проекты VPS остались доступны. Полный
  содержательный Pi-run на VPS по-прежнему заблокирован provider
  `401 AuthError`.
- Web export уже содержит manifest, service worker, icon, install banner и
  static index link;
  ручная проверка desktop/tablet/mobile Projects после auth/status правок
  пройдена в `1440x900`, `1024x768` и `390x844`. Встроенный Chromium также
  подтвердил `display=standalone`, активированный service worker и обход API
  shell-кэша. Синтетическое `beforeinstallprompt` показало banner и вызов
  `prompt()`. Экспорт теперь вычисляет revision service-worker cache из
  `index.html`, а unit-тесты подтверждают server-scoped draft storage и
  metadata snapshots проектов; не пройдены release-проверки фактической
  установки, standalone launch и browser update flow в Chromium/Edge.
- Windows guard проверен: `pi+bwrap` отклоняется с требованием WSL2/Linux-
  контейнера, а native `pi+none` без `PI_TRUSTED_MODE=true` не запускается.
  Production sandbox, эквивалентный Linux `bwrap`, на Windows всё ещё не
  прошёл отдельную проверку; для релиза требуется WSL2/контейнер или формально
  ограниченный доверенный режим.
- HTTPS/Tailscale URLs и CORS проверены: собственный VPS Web-origin и локальный
  Tailscale origin разрешены, посторонний Origin не получает CORS allowlist.
  Браузерный UI двух узлов и per-node offline status проверены. Отдельные
  credentials каждого подключения, pairing, token rotation и пользовательский
  login ещё отсутствуют.

## Внешние интеграции

- Environment-provider OpenCode Go на VPS запускается внутри `bwrap`, но
  последняя проверка `opencode-go/deepseek-v4-flash` завершилась upstream
  `401 AuthError` после `run.completed`; записи providers по-прежнему
  предоставляют только символические ссылки на секреты и не имеют серверного
  хранилища секретов.
- Эксперимент provider oRPC пока не генерирует OpenAPI-документ:
  `@orpc/openapi` намеренно не добавлен в production-зависимости до решения о
  мобильном транспорте.
- Проверка MCP намеренно не запускает настроенный процесс.
- Docker-образ собирается локально, Compose запускает API со здоровым
  `/health`, а VPS уже выполнял закреплённый Pi CLI (`0.80.3`) внутри настроенной
  namespace `bubblewrap`. Профиль остаётся непривилегированным: он не монтирует
  procfs и передаёт только необходимые device nodes, worktree, каталог сессии,
  состояние Pi и явный allowlist providers. Перед hardened deployment нужно
  заменить `unconfined` seccomp на проверенный отдельный профиль.

## Безопасность и эксплуатация

- Аутентификация пользователей намеренно исключена из текущей Tailnet-only
  фазы. Production CORS allowlist и ограничение тела запроса настроены; публичное
  открытие пока не поддерживается.
- На выбранном OpenVZ VPS отсутствует `/dev/net/tun`. Поэтому Tailscale работает
  в userspace networking mode, а для проверки деплоя используется приватный
  endpoint `tailscale serve`.
- Резервное копирование и staging-восстановление с проверкой целостности покрывают
  SQLite, разрешённые ресурсы `.agents`, runtime-файлы сессий и Git refs.
  Защищённая активация может перепривязать только явно указанный чистый checkout,
  если каждая восстановленная ветка Task имеет точный сохранённый SHA; clone/fetch
  намеренно не выполняются. Полный real-Pi continuation после активации всё ещё
  требует сквозного release-прогона.
- Для VPS остаются необходимыми supervision/метрики нескольких инстансов и
  внешняя доставка disk alerts. В базовом single-container варианте уже есть
  Docker restart policy, структурированные lifecycle-логи, проверка свободного
  места и корректное завершение по `SIGINT`/`SIGTERM`.
