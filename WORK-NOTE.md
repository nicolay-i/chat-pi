# Рабочая заметка: chat-pi

Дата обновления: 2026-07-17.

## Каноническое место работы

- Основной checkout: `D:\chat-pi`.
- Репозиторий: `https://github.com/nicolay-i/chat-pi.git`, ветка `main`.
- Базовый проверенный commit: `28533c0`; актуальную ревизию смотреть через
  `git log -1 --oneline`.
- Не работать из `D:\Documents\ProjectsPet\chat-pi`: это отдельный устаревший checkout.

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

- В Chromium проверены desktop `1440x900`, tablet landscape `1024x768`, tablet
  portrait `768x1024` и контрольный mobile `390x844`. Dashboard и Chat не имеют
  document-level горизонтального переполнения; боковая навигация, очередь,
  composer и меню режима отправки остаются доступными. На мобильном dashboard
  действие Settings перенесено на отдельную строку и не пересекается с длинным
  именем проекта.
- Полные monorepo `typecheck` и тесты прошли; Mobile lint завершился без
  ошибок, но со 101 предупреждением.
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
- Полный `pnpm test` прошёл при штатном параллельном запуске пакетов:
  Contracts 16 passed; API 209 passed, 2 skipped; Mobile 245 passed.
- Browser e2e: проектный маршрут -> `Open Ignis` -> реальный vault `chat-pi`.
  Проверочная Markdown-заметка была создана через Web, сохранилась после полной
  перезагрузки, повторно открылась с тем же текстом и была подтверждена в
  `/srv/projects/chat-pi`; `Server: Connected`, ошибок консоли нет. Временная
  заметка удалена, managed clone остался clean.

## Открытые release gates

- Физическая Android/iOS QA и production signing. Попытка 14.07.2026 через
  `agent-device 0.16.7` сначала упиралась в запуск daemon из недоступного
  user/C:\tmp state (`mrk0yl3c-8b11b7b1`, `mrk0zoax-1e6323ad`). Writable
  state-dir внутри workspace позволил daemon стартовать, но Android discovery
  завершился внутренним 90-секундным timeout (`mrk1p2jk-5aacca0a`); процессов
  emulator/qemu/adb на машине в этот момент не было. Это не считается
  пройденной device-проверкой.
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
