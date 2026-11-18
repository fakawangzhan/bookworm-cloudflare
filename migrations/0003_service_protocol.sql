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
