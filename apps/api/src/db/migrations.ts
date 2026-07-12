import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
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
   );`,
  `CREATE TABLE IF NOT EXISTS chats (
     id text primary key,
     project_id text not null references projects(id),
     title text not null,
     mode text not null,
     active_task_id text,
     active_pi_session_id text,
     archived_at text,
     created_at text not null,
     updated_at text not null
   );`,
  `CREATE TABLE IF NOT EXISTS tasks (
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
   );`,
  `CREATE TABLE IF NOT EXISTS chat_events (
     id text primary key,
     sequence integer not null unique,
     project_id text not null,
     chat_id text,
     task_id text,
     pi_session_id text,
     source text not null,
     type text not null,
     payload_json text not null,
     created_at text not null
   );`,
  `CREATE TABLE IF NOT EXISTS event_sequences (
     sequence integer primary key autoincrement
   );`,
  `CREATE TABLE IF NOT EXISTS task_checkpoints (
     id text primary key,
     task_id text not null references tasks(id),
     pi_session_id text,
     pi_entry_id text,
     before_sha text,
     after_sha text,
     patch_path text,
     summary text,
     created_at text not null
   );`,
  `CREATE TABLE IF NOT EXISTS pi_sessions (
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
   );`,
  `CREATE TABLE IF NOT EXISTS packages (
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
   );`,
  `CREATE TABLE IF NOT EXISTS providers (
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
   );`,
  `CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);`,
];

export function migrate(db: DatabaseSync): void {
  for (const sql of MIGRATIONS) {
    db.exec(sql);
  }

  const columns = db.prepare('PRAGMA table_info(chat_events)').all() as { name: string }[];
  if (!columns.some((column) => column.name === 'sequence')) {
    db.exec('ALTER TABLE chat_events ADD COLUMN sequence integer');
  }
  db.exec('UPDATE chat_events SET sequence = rowid WHERE sequence IS NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_events_sequence ON chat_events(sequence)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_chat_events_stream_sequence ON chat_events(chat_id, task_id, sequence)');
  db.exec('INSERT OR IGNORE INTO event_sequences(sequence) SELECT sequence FROM chat_events');
}
