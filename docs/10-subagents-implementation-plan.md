# 10. План реализации по subagents

> Статус: исторический план декомпозиции. Package-install задачи отложены;
> текущие критерии приёмки находятся в `plans/2.md`.

## How to use this plan

Каждый пункт можно выдавать отдельному subagent. Детальные задания лежат в `.agents/tasks/*.md`.

Правило: subagent не считается завершившим задачу, пока не выполнены acceptance checks и verification commands из его task file.

## Phase 0 — Bootstrap

### T00 — Bootstrap React Native project

Goal: создать Expo React Native Web проект на актуальном SDK и подготовить структуру.

Verification:

- `pnpm --filter mobile typecheck` passes.
- `pnpm --filter mobile web` starts.
- `app/_layout.tsx` and initial routes exist.
- Expo SDK version documented in `docs/12-source-notes.md`.

### T01 — Monorepo/tooling/contracts

Goal: pnpm workspace, shared contracts package, lint/typecheck scripts.

Verification:

- `pnpm -r typecheck` passes.
- Frontend imports type from `packages/contracts`.
- No duplicated DTO definitions for Project/Chat/Task.

## Phase 1 — UI foundation

### T02 — Design system from reference

Goal: tokens, base components, chat reference screen.

Verification:

- `ChatReferenceScreen` visually matches provided reference structure.
- Components have testIDs and accessibility labels.
- Tokens centralized.

### T03 — Navigation shell

Goal: Expo Router routes for all major screens.

Verification:

- All route groups exist.
- Mobile navigation works.
- Web layout has sidebar + context panel placeholder.

## Phase 2 — API and realtime client

### T04 — API client and typed schemas

Goal: typed API client, query layer, errors.

Verification:

- Mock calls typecheck.
- API errors normalized.
- No `any` in public client methods.

### T05 — Realtime event stream

Goal: SSE/WebSocket abstraction with resume.

Verification:

- Simulated disconnect resumes from last event id.
- Chat reducer applies event sequence deterministically.

## Phase 3 — Core product screens

### T06 — Connection setup

Verification: valid mock URL proceeds; invalid URL shows error.

### T07 — Projects and project settings

Verification: projects list, create/edit, repo validation states.

### T08 — Chats list and new chat

Verification: mode picker creates correct payload; chats filtered by mode.

### T09 — Chat thread UI

Verification: message list, tool cards, streaming, timestamps.

### T10 — Composer queue modes and quick actions

Verification: Send/FollowUp/Steer/Abort states and disabled logic.

## Phase 4 — Tasks/worktrees UX

### T11 — Tasks list/detail

Verification: parallel running tasks shown independently.

### T12 — Runtime status and full trace

Verification: tool events and run events visible/filterable.

### T13 — Diff review

Verification: file list + unified diff + mobile/web variants.

### T14 — Merge flow

Verification: merge button disabled/enabled correctly; conflict state UI exists.

### T15 — Checkpoints, fork, rollback

Verification: fork/rollback request uses checkpoint id and creates new task in mock.

## Phase 5 — Knowledge/files/settings

### T16 — File browser and Markdown viewer

Verification: search, preview, frontmatter panel.

### T17 — Skills/prompts/actions

Verification: skill list/editor/action picker and validation states.

### T18 — Providers/MCP/packages

Verification: provider form, package install review, trust toggle.

### T19 — Theme editor

Verification: changing accent updates chat preview.

### T20 — App settings/offline/notifications

Verification: connection reset, reconnect banner, approval list.

## Phase 6 — Backend MVP

### B00 — Hono API bootstrap

Verification: health/capabilities endpoints and tests.

### B01 — DB schema/repositories

Verification: migrations run on temp DB; repositories tested.

### B02 — Project/chat/task services

Verification: create project/chat/task flows tested.

### B03 — Git worktree manager

Verification: real temp git repo creates branches/worktrees.

### B04 — Pi runtime wrapper/fake runtime

Verification: fake runtime emits normalized events; real adapter behind interface.

### B05 — Event store/realtime

Verification: SSE resume by event id tested.

### B06 — Session sync

Verification: JSONL import/tailer handles append and dedupe.

### B07 — Actions/skills/package/provider manager

Verification: install review, trust, provider secret redaction tested.

### B08 — Merge/checkpoint/fork/rollback services

Verification: temp git repo integration tests for each flow.

## Phase 7 — Final hardening

### T21 — Tests, CI, accessibility pass

Verification: all required commands pass; critical buttons labelled; known gaps documented.

### T22 — Documentation and handoff

Verification: README updated; architecture docs match code; runbook exists.
