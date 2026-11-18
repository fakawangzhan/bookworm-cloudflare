CREATE TABLE IF NOT EXISTS bw_long_tasks (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner_id TEXT NOT NULL, book_id TEXT NOT NULL,
  signature TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', profile_id TEXT NOT NULL,
  profile_label TEXT NOT NULL DEFAULT '', profile_model TEXT NOT NULL DEFAULT '',
  workflow_id TEXT, status TEXT NOT NULL, completed_parts INTEGER NOT NULL DEFAULT 0,
  total_parts INTEGER NOT NULL DEFAULT 0, message TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bw_long_tasks_owner ON bw_long_tasks(owner_id, book_id, updated_at);
CREATE TABLE IF NOT EXISTS bw_long_task_parts (
  task_id TEXT NOT NULL, part_id TEXT NOT NULL, part_index INTEGER NOT NULL,
  value TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'done', updated_at TEXT NOT NULL,
  PRIMARY KEY(task_id, part_id)
);
CREATE TABLE IF NOT EXISTS bw_long_task_results (task_id TEXT PRIMARY KEY, value TEXT NOT NULL, created_at TEXT NOT NULL);
