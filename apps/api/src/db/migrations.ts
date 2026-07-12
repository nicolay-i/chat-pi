import type { DatabaseSync } from 'node:sqlite';

export const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
     id text primary key,
     name text not null,
     repo_path text not null,
     default_branch text not null,
     agents_dir text not null default '.agents',
     ignis_url text,
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
     pi_session_id text,
     parent_chat_id text,
     active_leaf_entry_id text,
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
     pi_session_id text,
     start_pi_entry_id text,
     end_pi_entry_id text,
     pending_pi_fork_entry_id text,
     last_run_id text,
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
     chat_id text,
     run_id text,
     step_number integer,
     pi_session_id text,
     pi_entry_id text,
     before_sha text,
     after_sha text,
     patch_path text,
     has_file_changes integer,
     changed_files integer,
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
  `CREATE TABLE IF NOT EXISTS queued_messages (
     id text primary key,
     chat_id text not null references chats(id),
     task_id text references tasks(id),
     kind text not null,
     text text not null,
     position integer not null,
     status text not null,
     created_at text not null,
     updated_at text not null
   );`,
  `CREATE TABLE IF NOT EXISTS runtime_processes (
     id text primary key,
     project_id text not null references projects(id),
     chat_id text references chats(id),
     task_id text references tasks(id),
     pi_session_id text not null references pi_sessions(id),
     run_id text not null,
     pid integer,
     command text not null,
     cwd text not null,
     sandbox_mode text not null,
     status text not null,
     exit_reason text,
     started_at text not null,
     ended_at text
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
  `CREATE INDEX IF NOT EXISTS idx_queued_messages_chat ON queued_messages(chat_id, status, position);`,
  `CREATE INDEX IF NOT EXISTS idx_runtime_processes_session ON runtime_processes(pi_session_id, started_at);`,
  `CREATE INDEX IF NOT EXISTS idx_runtime_processes_task ON runtime_processes(task_id, started_at);`,
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

  // The initial scaffold already created databases in development. SQLite's
  // CREATE TABLE IF NOT EXISTS cannot add fields to those databases, so make
  // the ownership and step metadata migration explicitly additive.
  const ensureColumn = (table: string, column: string, definition: string): void => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((item) => item.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn('chats', 'pi_session_id', 'text');
  ensureColumn('chats', 'parent_chat_id', 'text');
  ensureColumn('chats', 'active_leaf_entry_id', 'text');
  ensureColumn('tasks', 'pi_session_id', 'text');
  ensureColumn('tasks', 'start_pi_entry_id', 'text');
  ensureColumn('tasks', 'end_pi_entry_id', 'text');
  ensureColumn('tasks', 'pending_pi_fork_entry_id', 'text');
  ensureColumn('tasks', 'last_run_id', 'text');
  ensureColumn('projects', 'ignis_url', 'text');
  ensureColumn('task_checkpoints', 'chat_id', 'text');
  ensureColumn('task_checkpoints', 'run_id', 'text');
  ensureColumn('task_checkpoints', 'step_number', 'integer');
  ensureColumn('task_checkpoints', 'has_file_changes', 'integer');
  ensureColumn('task_checkpoints', 'changed_files', 'integer');
  db.exec('UPDATE chats SET pi_session_id = active_pi_session_id WHERE pi_session_id IS NULL AND active_pi_session_id IS NOT NULL');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_pi_sessions_chat ON pi_sessions(chat_id) WHERE chat_id IS NOT NULL');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_chat ON tasks(source_chat_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_checkpoints_task_step ON task_checkpoints(task_id, step_number)');
}
