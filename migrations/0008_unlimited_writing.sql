-- Convert historical quotas to metering without changing saved work or configuration.
DROP TRIGGER IF EXISTS bw_creation_reserve;
CREATE TRIGGER bw_creation_reserve BEFORE INSERT ON bw_creation_requests BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_creation_steps WHERE owner=NEW.owner AND book=NEW.book AND step=NEW.step) THEN RAISE(ABORT,'CREATION_STATE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bw_creation_requests WHERE owner=NEW.owner AND book=NEW.book AND step=NEW.step AND status='running') THEN RAISE(ABORT,'CREATION_RUNNING') END;
 UPDATE bw_creation_steps SET attempts=attempts+1 WHERE owner=NEW.owner AND book=NEW.book AND step=NEW.step;
END;
DROP TRIGGER IF EXISTS bw_task_request_budget;
CREATE TRIGGER bw_task_request_budget BEFORE INSERT ON bw_task_requests BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bw_task_state WHERE task_id=NEW.task_id) THEN RAISE(ABORT,'AUDIT_STATE') END;
 UPDATE bw_task_state SET used=used+1,reserved_tokens=reserved_tokens+NEW.reserved_tokens WHERE task_id=NEW.task_id;
 UPDATE bw_task_state SET root_used=root_used+1 WHERE task_id=COALESCE((SELECT quality_root FROM bw_task_state WHERE task_id=NEW.task_id),NEW.task_id) AND root_limit IS NOT NULL;
END;
