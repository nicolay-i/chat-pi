# 04. Architecture

> Status: historical architecture draft. Package Manager is deferred by
> `plans/2.md` and is not mounted in the current application.

## 1. High-level architecture

```text
React Native / Web app
        |
        | typed HTTP + SSE/WebSocket
        v
Hono API on VPS
        |
        +-- Project/Chat/Task API
        +-- Event Store
        +-- Action Engine
        +-- Package Manager
        +-- Provider/MCP Manager
        +-- Pi Runtime Manager
        +-- Git Worktree Manager
        |
        v
Project runtime storage
        +-- canonical repo checkout
        +-- worktrees/task-*
        +-- pi sessions/*.jsonl
        +-- event log
        +-- patches
        +-- checkpoints
```

## 2. Runtime storage layout

```text
/var/lib/agents/
  projects/
    <projectId>/
      repo/
      worktrees/
        <taskId>/
      sessions/
        <chatId>.jsonl
        <taskId>.jsonl
      events/
      patches/
      logs/
      indexes/
      secrets/
```

Project repo itself:

```text
repo/
  AGENTS.md
  .agents/
    project.json
    prompts/
    skills/
    extensions/
    packages/
    packages.lock.json
    mcp.json
    providers.json
    ui/
      theme.json
      actions.json
```

`.agents` is portable project config. Runtime state is outside repo unless explicitly exported.

## 3. Frontend modules

```text
src/
  api/
    client.ts
    eventStream.ts
  components/
    chat/
    diff/
    files/
    layout/
    ui/
  features/
    projects/
    chats/
    tasks/
    settings/
    packages/
    providers/
    skills/
  theme/
  state/
  utils/
```

## 4. Backend modules

```text
src/
  index.ts
  env.ts
  db/
  routes/
  realtime/
  services/
    projectService.ts
    chatService.ts
    taskService.ts
    eventStore.ts
    gitWorktreeService.ts
    piRuntimeService.ts
    sessionSyncService.ts
    actionEngine.ts
    packageService.ts
    providerService.ts
    mcpService.ts
    secretService.ts
```

## 5. Event flow

```text
User sends message
  -> API command validates state
  -> TaskRuntime.prompt/steer/followUp/abort
  -> Pi emits events
  -> Backend normalizes events
  -> EventStore append
  -> SSE/WS broadcast
  -> Frontend reducer updates projection
```

## 6. Worktree flow

```text
Create writable task
  -> resolve target branch and base sha
  -> create branch agents/task/<taskId>
  -> git worktree add runtime/worktrees/<taskId>
  -> create Pi session with cwd = worktreePath
  -> start run
```

## 7. Merge flow

```text
Task idle + user presses Слить в repo
  -> final checkpoint
  -> run checks
  -> update target branch
  -> rebase or merge task branch
  -> if conflict: status merge_conflict
  -> if clean: squash merge into target
  -> append merge.completed
  -> optionally remove/archive worktree
```

## 8. Session sync

```text
Pi JSONL file
  -> tailer/importer
  -> normalized app events
  -> chat projection
```

The app must never allow two writers for the same session file.

## 9. Security boundaries

- One user does not mean no security.
- Secrets are stored outside repo and redacted from events.
- Package extensions require explicit trust.
- Tool execution can be sandboxed.
- Shell/tool abort must kill child process group where possible.

## 10. Deployment MVP

```text
VPS:
  Hono API
  SQLite/Postgres
  Pi runtime
  repos/worktrees
  reverse proxy TLS

Client:
  RN native apps
  Web app
```

Later:

```text
Local worker:
  registers with VPS
  executes tasks against local filesystem
  communicates over Tailscale/SSH/reverse WebSocket
```
