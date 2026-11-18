CREATE TABLE IF NOT EXISTS bw_ai_leases (id TEXT PRIMARY KEY,account_key TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS bw_ai_lease_account ON bw_ai_leases(account_key,expires_at);
