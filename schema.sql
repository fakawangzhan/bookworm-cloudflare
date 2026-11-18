CREATE TABLE IF NOT EXISTS bw_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bw_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, group_name TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bw_sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS bw_sessions_lookup ON bw_sessions(token_hash, expires_at);
CREATE TABLE IF NOT EXISTS bw_books (owner_id TEXT NOT NULL, book_id TEXT NOT NULL, title TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, book_id));
CREATE INDEX IF NOT EXISTS bw_books_owner ON bw_books(owner_id, deleted_at, updated_at);
CREATE TABLE IF NOT EXISTS bw_book_parts (owner_id TEXT NOT NULL, book_id TEXT NOT NULL, part_index INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(owner_id, book_id, part_index));
CREATE INDEX IF NOT EXISTS bw_book_parts_lookup ON bw_book_parts(owner_id, book_id, part_index);
INSERT OR IGNORE INTO bw_settings(key,value,updated_at) VALUES ('auth.bootstrap_completed','0',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO bw_users(id,username,display_name,password_hash,group_name,status,created_at,updated_at) VALUES ('user-system-admin','system-admin','系统管理员','', 'system_admin','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS bw_preferences (user_id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);

-- Durable Cloudflare Workflow checkpoints. These tables are additive and do
-- not alter existing users, settings, books, or book parts.
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

-- Additive upgrade: existing books, settings and task results are retained.
DROP INDEX IF EXISTS bw_long_tasks_dedupe;
CREATE TABLE IF NOT EXISTS bw_task_blobs (
 task_id TEXT NOT NULL, name TEXT NOT NULL, part_index INTEGER NOT NULL, content TEXT NOT NULL,
 PRIMARY KEY(task_id,name,part_index)
);
CREATE TABLE IF NOT EXISTS bw_task_state (
 task_id TEXT PRIMARY KEY, identity TEXT UNIQUE NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
 chapter_id INTEGER, total_characters INTEGER NOT NULL DEFAULT 0, revision TEXT NOT NULL,
 quality_root TEXT, budget_limit INTEGER, token_limit INTEGER, planned INTEGER,
 used INTEGER NOT NULL DEFAULT 0, reserved_tokens INTEGER NOT NULL DEFAULT 0,
 root_limit INTEGER, root_used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bw_task_requests (
 task_id TEXT NOT NULL, node_key TEXT NOT NULL, attempt INTEGER NOT NULL, prompt_hash TEXT NOT NULL,
 status TEXT NOT NULL, reserved_tokens INTEGER NOT NULL, usage TEXT, error TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL, PRIMARY KEY(task_id,node_key,attempt)
);
CREATE TRIGGER IF NOT EXISTS bw_task_request_budget BEFORE INSERT ON bw_task_requests BEGIN
 SELECT CASE WHEN (SELECT COUNT(*) FROM bw_task_requests WHERE task_id=NEW.task_id AND node_key=NEW.node_key)>=2 THEN RAISE(ABORT,'AUDIT_STEP_LIMIT') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_task_state WHERE task_id=NEW.task_id AND used<budget_limit AND reserved_tokens+NEW.reserved_tokens<=token_limit) THEN RAISE(ABORT,'AUDIT_BUDGET') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_task_state WHERE task_id=COALESCE((SELECT quality_root FROM bw_task_state WHERE task_id=NEW.task_id),NEW.task_id) AND root_limit IS NOT NULL AND root_used>=root_limit) THEN RAISE(ABORT,'AUDIT_BUDGET') END;
 UPDATE bw_task_state SET used=used+1,reserved_tokens=reserved_tokens+NEW.reserved_tokens WHERE task_id=NEW.task_id;
 UPDATE bw_task_state SET root_used=root_used+1 WHERE task_id=COALESCE((SELECT quality_root FROM bw_task_state WHERE task_id=NEW.task_id),NEW.task_id) AND root_limit IS NOT NULL;
END;
CREATE TABLE IF NOT EXISTS bw_task_cache (
 scope TEXT NOT NULL, cache_key TEXT NOT NULL, task_id TEXT NOT NULL, blob_name TEXT NOT NULL,
 PRIMARY KEY(scope,cache_key)
);
CREATE TABLE IF NOT EXISTS bw_keywords (
 id INTEGER PRIMARY KEY,category TEXT NOT NULL,word TEXT NOT NULL,created_at TEXT NOT NULL,
 UNIQUE(category,word)
);
CREATE TABLE IF NOT EXISTS bw_keyword_aliases (
 category TEXT NOT NULL,alias TEXT NOT NULL,term_id INTEGER NOT NULL,
 PRIMARY KEY(category,alias,term_id)
);
CREATE TRIGGER IF NOT EXISTS bw_keyword_capacity BEFORE INSERT ON bw_keywords
 WHEN NOT EXISTS(SELECT 1 FROM bw_keywords WHERE category=NEW.category AND word=NEW.word)
 AND (SELECT COUNT(*) FROM bw_keywords WHERE category=NEW.category)>=100000
 BEGIN SELECT RAISE(IGNORE); END;

CREATE TABLE IF NOT EXISTS bw_service_logs (id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,value TEXT NOT NULL,created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS bw_book_parts (owner_id TEXT NOT NULL,book_id TEXT NOT NULL,part_index INTEGER NOT NULL,content TEXT NOT NULL,PRIMARY KEY(owner_id,book_id,part_index));
CREATE TABLE IF NOT EXISTS bw_creation_steps(owner TEXT NOT NULL,book TEXT NOT NULL,step TEXT NOT NULL,identity TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,request_limit INTEGER NOT NULL DEFAULT 2,PRIMARY KEY(owner,book,step));
CREATE TABLE IF NOT EXISTS bw_creation_requests(id TEXT PRIMARY KEY,owner TEXT NOT NULL,book TEXT NOT NULL,step TEXT NOT NULL,attempt INTEGER NOT NULL,status TEXT NOT NULL,model TEXT NOT NULL,prompt_hash TEXT,response_hash TEXT,error TEXT NOT NULL DEFAULT '',started TEXT NOT NULL,finished TEXT,duration_ms REAL,usage TEXT,UNIQUE(owner,book,step,attempt));
CREATE TABLE IF NOT EXISTS bw_creation_events(owner TEXT,book TEXT,step TEXT,event TEXT,at TEXT,PRIMARY KEY(owner,book,step,event));
CREATE TABLE IF NOT EXISTS bw_creation_retry_grants(request TEXT PRIMARY KEY,owner TEXT,book TEXT,step TEXT,at TEXT);
CREATE TRIGGER IF NOT EXISTS bw_creation_reserve BEFORE INSERT ON bw_creation_requests BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_creation_requests WHERE owner=NEW.owner AND book=NEW.book AND step=NEW.step AND status='running') THEN RAISE(ABORT,'CREATION_RUNNING') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_creation_steps WHERE owner=NEW.owner AND book=NEW.book AND step=NEW.step AND attempts<request_limit) THEN RAISE(ABORT,'CREATION_BUDGET') END;
 UPDATE bw_creation_steps SET attempts=attempts+1 WHERE owner=NEW.owner AND book=NEW.book AND step=NEW.step;
END;

CREATE TABLE IF NOT EXISTS bw_ai_leases (id TEXT PRIMARY KEY,account_key TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS bw_ai_lease_account ON bw_ai_leases(account_key,expires_at);
