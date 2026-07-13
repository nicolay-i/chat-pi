# 09. Test strategy

> Status: historical test plan. Package-install scenarios are deferred by
> `plans/2.md` and are excluded from the current acceptance matrix.

## 1. Levels

### Unit

- Reducers/state machines.
- Event normalization.
- Action visibility predicates.
- Worktree path/branch naming.
- API schema validation.

### Component

- Chat screen.
- Composer send modes.
- Tool card expanded/collapsed.
- Diff preview.
- Task status card.
- Settings forms.

### Integration

- Mock backend event stream -> UI projection.
- Send message -> queued/running/completed state.
- Fork checkpoint -> new task UI.
- Package install review flow.

### Backend integration

- Hono routes with test client.
- SQLite temp DB.
- Temp git repo with real worktrees.
- Fake Pi runtime event emitter.

### E2E smoke

- Create project.
- Create implementation chat/task.
- Receive streaming message/tool event.
- View diff.
- Merge task.

## 2. Required commands

Frontend:

```bash
pnpm --filter mobile typecheck
pnpm --filter mobile lint
pnpm --filter mobile test
pnpm --filter mobile web
```

Backend:

```bash
pnpm --filter api typecheck
pnpm --filter api lint
pnpm --filter api test
```

Contracts:

```bash
pnpm --filter contracts typecheck
pnpm --filter contracts test
```

Full workspace:

```bash
pnpm typecheck
pnpm test
```

## 3. Visual checks

Minimum stories/screenshots:

- Chat screen reference state.
- Chat streaming state.
- Tool card expanded.
- Diff review mobile.
- Project dashboard web.
- Settings provider form.

## 4. Subagent verification requirement

Every subagent must return:

```text
1. Changed files.
2. What was implemented.
3. Verification commands run.
4. Screens/routes manually checked.
5. Known gaps.
6. Screenshots/logs if UI changed.
```

If a subagent cannot run a verification command, it must say why and provide the closest static check.
