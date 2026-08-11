# Пробелы в тестировании

Набор тестов покрывает контракты, интеграцию API-маршрутов и сервисов,
настоящие временные Git-репозитории, MobX-хранилища и мобильные экраны.
Следующие поверхности пока не подтверждены автоматическими тестами и остаются
release gates.

## Сквозной runtime

- В CI нет теста, который одновременно подключает работающий процесс Hono,
  реальный browser bundle и настоящий Pi CLI. Ручной сценарий Tailnet-only
  Web -> VPS -> bwrap -> OpenCode Go пройден, но ему ещё нужна воспроизводимая
  CI-проверка.
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

- Native Android debug build был собран на Windows и открыт в локальном эмуляторе
  Pixel 3a API 34, где отображался Setup после подключения Metro. Debug APK не
  является standalone release-артефактом и требует доступного Metro-сервера.
- Standalone Android release APK был собран, установлен в эмулятор Pixel 3a API
  34 и подключён к VPS через Tailnet HTTPS. Он прошёл Setup, открыл сохранённый
  Chat и установил native SSE-транспорт без Metro.
- На Infinix проверены запуск, список проектов, открытие чатов и работа composer
  при открытой клавиатуре. Полный проход всех native-экранов, iOS QA и
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
- Реальный transport smoke локального ПК и VPS выполнен: узлы имели разные
  `serverId`, независимые Chat SSE-потоки и разные sequence ranges; остановка
  локального API не повлияла на health VPS, а перезапуск локального узла
  восстановил новый run. Полный параллельный содержательный Pi-run на VPS пока
  заблокирован provider `401 AuthError`; также остаётся отдельная проверка UI
  при одновременно зарегистрированных локальном и VPS URL через доступный
  HTTPS/Tailscale маршрут.
- Web export уже содержит manifest, service worker, icon и static index link;
  ручная проверка desktop/tablet/mobile Projects после auth/status правок
  пройдена в `1440x900`, `1024x768` и `390x844`; не пройдены release-проверки
  installability, standalone launch, update flow и сохранения draft во время
  обновления в Chromium/Edge.
- Windows backend не имеет подтверждённого production sandbox, эквивалентного
  Linux `bwrap`. Требуется отдельное решение на базе контейнера/WSL2 или явно
  ограниченный доверенный режим.
- Для PWA и нескольких узлов нужно проверить HTTPS/Tailscale URLs, CORS,
  браузерные ограничения mixed content/private network access и отдельные
  credentials каждого подключения. Node-level bearer уже реализован, но
  pairing, token rotation и пользовательский login ещё отсутствуют.

## Внешние интеграции

- Environment-provider OpenCode Go проверен на VPS в настоящем завершённом
  `bwrap` Pi turn через `opencode-go/deepseek-v4-flash`. Записи providers по-
  прежнему предоставляют только символические ссылки на секреты и не имеют
  серверного хранилища секретов.
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
