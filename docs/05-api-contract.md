# 05. API contract draft

> Status: draft. Package endpoints described below are deferred by `plans/2.md`
> and are not part of the current API registry.

Use this as a starting point for shared contracts. Exact implementation may use Hono RPC or oRPC. Streaming endpoints remain separate.

## 1. Health/capabilities

```http
GET /health
GET /api/capabilities
```

Response:

```ts
type Capabilities = {
  apiVersion: string;
  piAvailable: boolean;
  gitAvailable: boolean;
  supportsWorktrees: boolean;
  supportsSse: boolean;
  supportsWebSocket: boolean;
  supportsPackageInstall: boolean;
  supportsVscodeWeb: boolean;
  supportsIgnis: boolean;
};
```

## 2. Projects

```http
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
DELETE /api/projects/:projectId
POST   /api/projects/:projectId/validate-repo
```

## 3. Chats

```http
GET   /api/projects/:projectId/chats
POST  /api/projects/:projectId/chats
GET   /api/chats/:chatId
PATCH /api/chats/:chatId
POST  /api/chats/:chatId/archive
POST  /api/chats/:chatId/export
GET   /api/chats/:chatId/tree
GET   /api/chats/:chatId/trace
```

## 4. Messages / queue

```http
POST /api/chats/:chatId/messages
POST /api/tasks/:taskId/steer
POST /api/tasks/:taskId/follow-up
POST /api/tasks/:taskId/abort
POST /api/tasks/:taskId/abort-and-replace
```

Input:

```ts
type SendMessageInput = {
  text: string;
  behavior: 'send' | 'follow_up' | 'steer' | 'abort_and_replace';
  mode?: RunMode;
  modelId?: string;
  toolProfileId?: string;
  attachments?: AttachmentRef[];
};
```

## 5. Realtime

```http
GET /api/chats/:chatId/events?after=:eventId
GET /api/tasks/:taskId/events?after=:eventId
WS  /api/realtime
```

SSE event shape:

```ts
type RealtimeEnvelope = {
  id: string;
  stream: 'chat' | 'task' | 'project';
  streamId: string;
  type: EventType;
  payload: unknown;
  createdAt: string;
};
```

## 6. Tasks

```http
GET  /api/projects/:projectId/tasks
POST /api/projects/:projectId/tasks
GET  /api/tasks/:taskId
PATCH /api/tasks/:taskId
POST /api/tasks/:taskId/fork
POST /api/tasks/:taskId/rollback
POST /api/tasks/:taskId/rebase
POST /api/tasks/:taskId/merge
POST /api/tasks/:taskId/archive
```

## 7. Diff/files

```http
GET  /api/tasks/:taskId/diff
GET  /api/tasks/:taskId/diff/files/:encodedPath
POST /api/tasks/:taskId/revert-file
GET  /api/projects/:projectId/files
GET  /api/projects/:projectId/files/content?path=...
PUT  /api/projects/:projectId/files/content
POST /api/projects/:projectId/files/search
```

## 8. Checkpoints

```http
GET  /api/tasks/:taskId/checkpoints
POST /api/tasks/:taskId/checkpoints
GET  /api/tasks/:taskId/checkpoints/:checkpointId/diff
POST /api/tasks/:taskId/checkpoints/:checkpointId/fork
POST /api/tasks/:taskId/checkpoints/:checkpointId/rollback
```

## 9. Actions

```http
GET  /api/projects/:projectId/actions?context=...
POST /api/actions/:actionId/run
GET  /api/action-runs/:actionRunId
```

## 10. Skills/prompts/packages/providers/MCP

```http
GET  /api/projects/:projectId/skills
POST /api/projects/:projectId/skills
GET  /api/projects/:projectId/skills/:skillId
PUT  /api/projects/:projectId/skills/:skillId
POST /api/projects/:projectId/skills/:skillId/test

GET  /api/projects/:projectId/prompts
PUT  /api/projects/:projectId/prompts/:templateId

GET  /api/projects/:projectId/packages
POST /api/projects/:projectId/packages/resolve
POST /api/projects/:projectId/packages/install
POST /api/projects/:projectId/packages/:installId/trust
DELETE /api/projects/:projectId/packages/:installId

GET  /api/projects/:projectId/providers
POST /api/projects/:projectId/providers
POST /api/projects/:projectId/providers/:providerId/test

GET  /api/projects/:projectId/mcp
PUT  /api/projects/:projectId/mcp
POST /api/projects/:projectId/mcp/:serverId/test
```

### Experimental provider RPC transport

`/api/*` remains the stable transport. The same provider output schemas are
also exercised through an isolated oRPC endpoint while transport ergonomics are
evaluated:

```http
POST /rpc/providers/list
POST /rpc/providers/create
POST /rpc/providers/test
```

This transport is intentionally not used for messages or realtime; SSE stays
raw Hono.

## 11. Error shape

```ts
type ApiError = {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
};
```

## 12. Contract implementation rule

All command inputs and outputs must be defined in `packages/contracts/src/schemas.ts`. Frontend and backend import from the same package. No duplicated handwritten DTO types.
