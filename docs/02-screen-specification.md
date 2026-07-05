# 02. Спецификация экранов

Каждый экран ниже должен иметь: route, states, actions, API dependencies, empty/error/loading states, verification.

## 1. Connection / Server Setup

### Route

```text
/setup
```

### Назначение

Первый запуск. Пользователь указывает backend URL или выбирает ранее сохранённое подключение.

### UI

- Logo/title.
- Поле `Backend URL`.
- Переключатель `HTTPS / Tailscale / SSH tunnel note`.
- Кнопка `Проверить подключение`.
- Кнопка `Сохранить и продолжить`.
- Diagnostics panel: latency, version, server capabilities.

### States

- Empty initial.
- Checking.
- Connected.
- Invalid URL.
- Server unavailable.
- Unsupported backend version.

### Actions

- Test connection.
- Save connection.
- Reset stored connection.

### API

```http
GET /health
GET /api/capabilities
```

### Verification

- При валидном mock server переход на `/projects`.
- При ошибке показывается понятное сообщение.
- URL сохраняется в secure storage/native и local storage/web abstraction.
- Есть testID: `setup.backendUrl`, `setup.testConnection`, `setup.continue`.

---

## 2. Projects List

### Route

```text
/projects
```

### Назначение

Список проектов пользователя.

### UI

- Header: `Projects`.
- Search input.
- Cards проектов: name, repo path, active tasks, stale tasks, last activity.
- FAB/кнопка `New project`.
- Quick filter: `All`, `Active`, `Needs review`, `Stale`.

### States

- Loading projects.
- Empty list.
- Normal list.
- Offline cached list.
- Error.

### Actions

- Open project.
- Create project.
- Edit project.
- Archive project.

### API

```http
GET /api/projects
POST /api/projects
PATCH /api/projects/:projectId
```

### Verification

- Empty state содержит CTA создать проект.
- Active task counter совпадает с mock data.
- По tap открывается `/projects/:projectId`.

---

## 3. Create/Edit Project

### Route

```text
/projects/new
/projects/:projectId/settings/project
```

### UI

- Project name.
- Repo path on VPS.
- Default branch.
- Runtime state path.
- `.agents` directory preview.
- Toggle: initialize git if missing.
- Toggle: scan Markdown vault.
- Button: `Validate repo`.
- Button: `Save`.

### States

- New.
- Edit.
- Repo valid.
- Repo not found.
- Git missing.
- Permission denied.

### Verification

- Нельзя сохранить без successful validation.
- `.agents` preview показывает expected folders.
- API validation errors mapped to fields.

---

## 4. Project Dashboard

### Route

```text
/projects/:projectId
```

### Назначение

Главный экран проекта.

### UI mobile

- Header: project name + settings.
- Tabs/sections: `Chats`, `Tasks`, `Files`, `Actions`.
- Cards active tasks.
- Last chats.
- Quick actions.

### UI web

- Left sidebar: project navigation.
- Center: selected dashboard/list.
- Right panel: active run summary / diff summary.

### Verification

- Показывает chats и tasks отдельно.
- Active run status обновляется через event stream.
- Quick action visibility зависит от context.

---

## 5. Chats List

### Route

```text
/projects/:projectId/chats
```

### UI

- Search chats.
- Filter by mode.
- Chat row: title, last message, mode badge, active task status, unread/new events.
- Button `New chat`.

### Actions

- Open chat.
- Rename.
- Fork.
- Archive.
- Export session.

### Verification

- Archived chats скрыты по умолчанию.
- Active task badge отображает `running/needs review/stale`.

---

## 6. New Chat / Mode Picker

### Route

```text
/projects/:projectId/chats/new
```

### UI

- Mode cards:
  - Discussion;
  - Planning;
  - Implementation;
  - Orchestration.
- Model selector.
- Prompt template selector.
- Tool profile selector.
- Optional initial prompt.
- Toggle: create writable task now.

### Verification

- Discussion/planning не создают worktree до write action.
- Implementation создаёт task + worktree.
- Prompt template snapshot сохраняется в run metadata.

---

## 7. Chat Thread

### Route

```text
/projects/:projectId/chats/:chatId
```

### Назначение

Основной экран, похожий на приложенный design reference.

### UI элементы

- Верхний header:
  - back/project;
  - chat title;
  - mode badge;
  - active model;
  - task status.
- Message list:
  - assistant bubble white;
  - user bubble purple;
  - timestamps;
  - compact message actions;
  - tool cards;
  - diff previews;
  - queued messages;
  - streaming cursor.
- Bottom quick actions row.
- Composer:
  - attach icon;
  - input placeholder `Сообщение...`;
  - send button;
  - expanded send menu: Send / Follow up / Steer / Abort & replace.

### Visual requirements from reference

- Background near `#F5F7FB`.
- User bubble accent purple `#6258F4`.
- Assistant cards white.
- Tool diff card green background.
- Rounded chips at bottom.
- Main send FAB circular purple.
- Toolcall card collapsed header + preview.

### States

- Idle.
- Streaming assistant response.
- Tool running.
- Queue has follow-ups.
- Steer accepted.
- Run aborted.
- Run failed.
- Offline/reconnecting.

### Actions

- Send message.
- Follow up.
- Steer.
- Abort.
- Abort and replace.
- Tap tool card.
- Open diff.
- Apply quick action.
- Fork from message.
- Rollback to message/checkpoint.

### API

```http
GET /api/chats/:chatId
GET /api/chats/:chatId/events?after=:eventId
POST /api/chats/:chatId/messages
POST /api/tasks/:taskId/steer
POST /api/tasks/:taskId/follow-up
POST /api/tasks/:taskId/abort
```

### Verification

- Streaming delta появляется без full screen reload.
- После reconnect догружаются events after last seen id.
- Tool card expandable.
- Quick actions row не перекрывает keyboard.
- Accessibility label есть у send/attach/action buttons.

---

## 8. Message Detail / Full Trace Entry

### Route

```text
/projects/:projectId/chats/:chatId/messages/:messageId
```

### UI

- Полный текст message.
- Metadata: role, model, tokens, cost, createdAt.
- Parent/child entry ids.
- Related tool calls.
- Related checkpoint/diff.
- Actions: copy, fork from here, rollback from here.

### Verification

- Показывает tool calls, связанные с message.
- Fork action создаёт новый chat/task от правильного checkpoint.

---

## 9. Tool Call Detail

### Route

```text
/projects/:projectId/chats/:chatId/toolcalls/:toolCallId
```

### UI

- Tool name.
- Status.
- Arguments JSON.
- Output text/log.
- Error block if failed.
- Related files.
- Redaction markers for secrets.

### Verification

- Long output virtualized/truncated with expand.
- Secrets redacted.
- Copy output action works.

---

## 10. Full Trace

### Route

```text
/projects/:projectId/chats/:chatId/trace
```

### UI

- Event timeline.
- Filter: messages/tools/checkpoints/diffs/errors/queue.
- Raw JSON event viewer.
- Export JSONL / Markdown.

### Verification

- Raw trace contains tool args/results.
- Filter state persists while navigating back.
- Export file contains no unredacted secrets.

---

## 11. Tasks List

### Route

```text
/projects/:projectId/tasks
```

### UI

- Task groups:
  - Running;
  - Queued;
  - Needs review;
  - Stale;
  - Merged;
  - Archived.
- Task card: title, branch, base sha, changed files, last event, active tool.
- FAB: new task.

### Verification

- Parallel tasks displayed independently.
- Running tasks update in realtime.
- Stale tasks show rebase CTA.

---

## 12. Task Detail

### Route

```text
/projects/:projectId/tasks/:taskId
```

### UI

- Header: status, branch, worktree path.
- Tabs:
  - Overview;
  - Chat;
  - Diff;
  - Checkpoints;
  - Trace;
  - Files;
  - Merge.
- Runtime panel: current run, active tool, queue, elapsed time.
- Dangerous actions collapsed.

### Verification

- Worktree path and branch are visible.
- Task lock state visible.
- Merge button disabled while running.

---

## 13. Diff Review

### Route

```text
/projects/:projectId/tasks/:taskId/diff
```

### UI mobile

- File list.
- Single-file unified diff.
- Toggle rendered Markdown diff for `.md` files.
- Actions: approve file, revert file, open file.

### UI web

- Split view with side-by-side diff.
- File tree left, diff center, summary right.
- Web-only Monaco integration allowed.

### Verification

- Binary/large files are handled gracefully.
- Revert file calls backend and updates diff.
- `Слить в repo` unavailable until task idle and checks pass or user overrides.

---

## 14. Merge Task

### Route

```text
/projects/:projectId/tasks/:taskId/merge
```

### UI

- Target branch selector.
- Strategy: squash / merge commit / rebase merge / patch only.
- Checks summary.
- Commit message editor.
- Conflict warnings.
- Button `Слить в repo`.

### States

- Ready.
- Checks running.
- Checks failed.
- Merge running.
- Merge conflict.
- Merge success.

### Verification

- Merge not allowed during running task.
- Squash commit path creates final commit.
- Conflict state links to conflict resolver.

---

## 15. Merge Conflict Resolver

### Route

```text
/projects/:projectId/tasks/:taskId/conflicts
```

### UI

- List conflicting files.
- Conflict blocks.
- Actions:
  - choose ours;
  - choose theirs;
  - ask agent to resolve;
  - open in VSCode Web;
  - abort merge.

### Verification

- Conflict files detected from backend.
- User can abort merge safely.
- Agent conflict resolution creates a new checkpoint.

---

## 16. Checkpoints / Session Tree

### Route

```text
/projects/:projectId/tasks/:taskId/checkpoints
/projects/:projectId/chats/:chatId/tree
```

### UI

- Timeline/tree of checkpoints.
- Each item: message summary, sha, changed files, timestamp.
- Actions: fork, rollback, view diff, export.

### Verification

- Rollback creates new task by default.
- Fork links chat entry and filesystem checkpoint.
- Current active checkpoint highlighted.

---

## 17. Files / Markdown Vault

### Route

```text
/projects/:projectId/files
/projects/:projectId/files/view?path=...
```

### UI

- File tree.
- Search.
- Markdown preview.
- Frontmatter panel.
- Backlinks/tags panel.
- Open in chat context.
- Ask about file.

### Verification

- Exact search works.
- Markdown rendered safely.
- Large file handling has size warning.

---

## 18. Actions / Skill Picker

### Route

```text
/projects/:projectId/actions
/projects/:projectId/chats/:chatId/actions
```

### UI

- Suggested actions.
- Static actions.
- Skill list.
- Search skills.
- Confirmation sheet for side-effect actions.

### Verification

- `visibleWhen/enabledWhen` evaluated from current context.
- Side-effect action asks confirmation if configured.
- Action run appears in trace.

---

## 19. Skills List

### Route

```text
/projects/:projectId/settings/skills
```

### UI

- List `.agents/skills`.
- Installed package skills.
- Enabled/disabled toggles.
- Open editor.
- Create new skill.
- Extract skill from chat.

### Verification

- Skills loaded from `.agents/skills`.
- Editing skill creates diff/checkpoint.
- Disabled skill not offered in picker.

---

## 20. Skill Editor

### Route

```text
/projects/:projectId/settings/skills/:skillId
```

### UI

- Markdown editor.
- Preview.
- Metadata.
- Test skill on current context.
- Save as patch.

### Verification

- Invalid skill structure gives validation error.
- Save writes to `.agents/skills/<skill>/SKILL.md` through reviewed patch.

---

## 21. Prompt Templates

### Route

```text
/projects/:projectId/settings/prompts
/projects/:projectId/settings/prompts/:templateId
```

### UI

- Templates by mode.
- Editor.
- Variables list.
- Render preview.
- Version history.

### Verification

- Prompt snapshot stored in run metadata.
- Template variables validated.
- Previous version can be restored through patch.

---

## 22. Provider Settings

### Route

```text
/projects/:projectId/settings/providers
```

### UI

- Provider list.
- Add provider.
- Fields:
  - type: built-in / OpenAI-compatible / Anthropic-compatible / Google-compatible / custom Pi plugin;
  - base URL;
  - API key ref;
  - model discovery/test.
- Model list.

### Verification

- Secrets not returned raw to frontend.
- Test connection result shown.
- Provider can be selected in New Chat.

---

## 23. Pi Package / Plugin Manager

### Route

```text
/projects/:projectId/settings/packages
/projects/:projectId/settings/packages/install
```

### UI

- Installed packages.
- Install source:
  - npm package;
  - git URL;
  - local path/upload.
- Manifest preview.
- Resource preview: extensions/skills/prompts/themes/providers.
- Trust toggle.
- Install/update/remove actions.

### Verification

- Package installed into `.agents/packages`.
- `.agents/packages.lock.json` updated.
- Untrusted extension not executed.
- Running task not silently reloaded.

---

## 24. MCP Settings

### Route

```text
/projects/:projectId/settings/mcp
```

### UI

- Server list.
- Add/edit server.
- Command/env/transport fields.
- Enable per mode.
- Test tools listing.

### Verification

- MCP config saved to `.agents/mcp.json` or runtime secret refs.
- Env secrets redacted.
- Tools appear in tool profile only after successful test.

---

## 25. Theme Editor

### Route

```text
/projects/:projectId/settings/theme
```

### UI

- Theme presets.
- Color tokens.
- Radius/spacing/font tokens.
- Live preview with chat reference.
- Export/import JSON.

### Verification

- Changing accent updates user bubble and send button.
- Invalid token values rejected.
- Theme persisted per project.

---

## 26. App Settings

### Route

```text
/settings
```

### UI

- Backend connection.
- Device identity.
- Notification settings.
- Cache/reset.
- About/version.

### Verification

- Reset connection returns to setup.
- App version and backend version visible.

---

## 27. VSCode Web

### Route

```text
/projects/:projectId/tasks/:taskId/vscode
```

### UI

- Web-only iframe/proxy to code-server/openvscode.
- Native mobile fallback: show instruction/open web URL.

### Verification

- Route hidden or fallback on native if unsupported.
- Opens task worktree, not main checkout.

---

## 28. Obsidian / Ignis

### Route

```text
/projects/:projectId/obsidian
```

### UI

- Web-only iframe/proxy to Ignis.
- Vault selector.
- Conflict warning if active task edits same file.

### Verification

- Opens configured Markdown vault.
- File conflict detection warning appears when hash changed.

---

## 29. Notifications / Approvals

### Route

```text
/approvals
```

### UI

- Pending approvals:
  - merge;
  - shell command;
  - package trust;
  - patch apply;
  - MCP access.
- Quick approve/reject.

### Verification

- Push tap opens exact approval.
- Reject writes event and unblocks waiting run.

---

## 30. Error / Offline / Reconnect overlay

### UI

- Global network banner.
- Event stream reconnect indicator.
- Last synced event id.
- Retry button.

### Verification

- Simulated offline does not crash chat.
- On reconnect events replay from last event id.
