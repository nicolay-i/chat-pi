# 00. Product brief

## Назначение

Приложение — это мобильная и web-оболочка для управляемой агентной работы с Pi. Пользователь с телефона или компьютера видит чаты, запускает задачи, уточняет активный run, просматривает tool calls, diff, файлы, Markdown-базу знаний, skills, провайдеры, MCP и плагины.

## Целевая среда

- Один пользователь.
- Backend всегда поднят на VPS.
- Доступ к backend через HTTPS, Tailscale/LAN или SSH-туннель.
- Runtime Pi исполняется там, где доступны repo/worktree, secrets и tools. Для MVP считать, что repo и runtime находятся на VPS.
- В будущем допускается remote worker на локальной машине, подключённый к VPS.

## Основные пользовательские сценарии

1. Открыть проект и увидеть список чатов/задач.
2. Создать новый чат в режиме discussion/planning/implementation/orchestration.
3. Написать сообщение агенту.
4. Во время выполнения отправить уточнение: `Steer`.
5. Поставить сообщение в очередь: `Follow up`.
6. Прервать текущий run и заменить запрос: `Abort & replace`.
7. Запустить несколько параллельных implementation-задач.
8. Посмотреть tool calls, bash output, полный trace.
9. Посмотреть diff, применить/отклонить/смёржить задачу.
10. Сделать fork сессии и файлового состояния от checkpoint.
11. Откатиться к checkpoint без потери старой ветки.
12. Работать с Markdown-файлами как с локальной базой знаний.
13. Применять quick actions и skills.
14. Установить Pi package/plugin через web UI.
15. Настроить провайдера моделей, включая Ollama/Ollama Cloud-like endpoints.
16. Настроить `.agents` project config, prompts, skills, MCP.
17. На web открыть VSCode Web / Obsidian Ignis рядом с чатом.

## Нецели MVP

- Multi-user/team permissions.
- Marketplace с публичной публикацией пакетов.
- Полноценный IDE experience на native mobile.
- Автоматический merge без review для risky изменений.
- Безопасное исполнение arbitrary plugin code без sandbox/trust-модели.

## Product principles

- Пользователь всегда видит, что агент делает сейчас.
- Любая запись в файлы ревьюится через diff/checkpoint.
- Параллельная работа изолирована через worktree.
- Сессии остаются переносимыми в текстовом JSONL/Markdown виде.
- Системная папка проекта — `.agents`, а Pi-specific compatibility делается через loader/adapters.
