CREATE TABLE IF NOT EXISTS bw_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bw_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, group_name TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bw_sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
CREATE INDEX IF NOT EXISTS bw_sessions_lookup ON bw_sessions(token_hash, expires_at);
CREATE TABLE IF NOT EXISTS bw_books (owner_id TEXT NOT NULL, book_id TEXT NOT NULL, title TEXT NOT NULL, revision INTEGER NOT NULL, content_hash TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(owner_id, book_id));
CREATE INDEX IF NOT EXISTS bw_books_owner ON bw_books(owner_id, deleted_at, updated_at);
INSERT OR IGNORE INTO bw_settings(key,value,updated_at) VALUES ('auth.bootstrap_completed','0',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO bw_users(id,username,display_name,password_hash,group_name,status,created_at,updated_at) VALUES ('user-system-admin','system-admin','系统管理员','', 'system_admin','active',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS bw_preferences (user_id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
