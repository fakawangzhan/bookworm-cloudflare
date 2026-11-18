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
