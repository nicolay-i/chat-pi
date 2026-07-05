# 06. Data model

## 1. Tables

```sql
projects (
  id text primary key,
  name text not null,
  repo_path text not null,
  default_branch text not null,
  agents_dir text not null default '.agents',
  runtime_state_path text not null,
  default_model_id text,
  theme_id text,
  created_at text not null,
  updated_at text not null
);

chats (
  id text primary key,
  project_id text not null references projects(id),
  title text not null,
  mode text not null,
  active_task_id text,
  active_pi_session_id text,
  archived_at text,
  created_at text not null,
  updated_at text not null
);

tasks (
  id text primary key,
  project_id text not null references projects(id),
  source_chat_id text references chats(id),
  title text not null,
  mode text not null,
  status text not null,
  base_branch text not null,
  base_sha text not null,
  branch_name text not null,
  worktree_path text not null,
  pi_session_path text not null,
  merge_target text not null,
  current_head_sha text,
  created_at text not null,
  updated_at text not null
);

chat_events (
  id text primary key,
  project_id text not null,
  chat_id text,
  task_id text,
  pi_session_id text,
  source text not null,
  type text not null,
  payload_json text not null,
  created_at text not null
);

task_checkpoints (
  id text primary key,
  task_id text not null references tasks(id),
  pi_session_id text,
  pi_entry_id text,
  before_sha text,
  after_sha text,
  patch_path text,
  summary text,
  created_at text not null
);

pi_sessions (
  id text primary key,
  project_id text not null,
  chat_id text,
  task_id text,
  path text not null,
  cwd text not null,
  active_leaf_entry_id text,
  last_imported_offset integer default 0,
  last_entry_id text,
  lock_owner text,
  lock_heartbeat_at text,
  created_at text not null,
  updated_at text not null
);

packages (
  id text primary key,
  project_id text not null,
  source text not null,
  name text not null,
  version text,
  install_path text not null,
  trusted integer not null default 0,
  enabled integer not null default 1,
  manifest_json text not null,
  created_at text not null,
  updated_at text not null
);

providers (
  id text primary key,
  project_id text not null,
  name text not null,
  type text not null,
  base_url text,
  secret_ref text,
  config_json text not null,
  enabled integer not null default 1,
  created_at text not null,
  updated_at text not null
);
```

## 2. Task statuses

```ts
type TaskStatus =
  | 'created'
  | 'creating_worktree'
  | 'idle'
  | 'queued'
  | 'running'
  | 'aborting'
  | 'needs_review'
  | 'stale'
  | 'checks_running'
  | 'checks_failed'
  | 'merge_running'
  | 'merge_conflict'
  | 'merged'
  | 'failed'
  | 'archived';
```

## 3. Event ordering

- `chat_events.id` should be sortable ULID/UUIDv7-like.
- Each stream endpoint returns events ordered by `created_at, id`.
- Client stores last seen event id per stream.

## 4. Secrets

Secrets are referenced, not stored in plain config.

```ts
type SecretRef = `secret:${string}`;
```

Events and exports must redact:

- API keys;
- OAuth tokens;
- SSH keys;
- env values marked secret;
- provider credentials.
