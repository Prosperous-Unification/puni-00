-- Caller validates the complete installed format and history inside one explicit transaction.
-- Execute complete breakpoint statements fail-fast; any error requires rollback.
CREATE TEMP TABLE run_execution_down_guard (allowed INTEGER NOT NULL CHECK(allowed = 1));
--> statement-breakpoint
INSERT INTO run_execution_down_guard(allowed)
SELECT CASE WHEN
  (SELECT count(*) FROM run_meta) = 1 AND
  (SELECT count(*) FROM run_meta WHERE singleton = 1 AND schema_version = 3) = 1 AND
  (SELECT count(*) FROM run_format) = 1 AND
  (SELECT count(*) FROM run_format WHERE singleton = 1
    AND typeof(scope_count) = 'integer' AND scope_count = (SELECT count(*) FROM run_runtime_scope)
    AND typeof(intent_count) = 'integer' AND intent_count = (SELECT count(*) FROM run_runtime_intent)
    AND typeof(acceptance_count) = 'integer' AND acceptance_count = (SELECT count(*) FROM run_runtime_acceptance)
    AND length(bundle_hash) = 64 AND bundle_hash NOT GLOB '*[^0-9a-f]*') = 1 AND
  -- Proof: F176 omitted only this clause; the queued-attempt CHECK rejection disappeared through complete prevalidation. Restored test passed.
  NOT EXISTS(SELECT 1 FROM run_attempt) AND
  NOT EXISTS(SELECT 1 FROM run_execution) AND
  NOT EXISTS(SELECT 1 FROM run_consumption) AND
  NOT EXISTS(SELECT 1 FROM run_completion) AND
  NOT EXISTS(SELECT 1 FROM run_receipt) AND
  NOT EXISTS(SELECT 1 FROM run_runtime_intent WHERE json_extract(json_extract(record, '$.canonicalRequest'), '$.operation.kind') IS NOT 'authority') AND
  NOT EXISTS(SELECT 1 FROM run_runtime_acceptance a LEFT JOIN run_runtime_intent i ON i.command_id = a.command_id WHERE json_extract(json_extract(i.record, '$.canonicalRequest'), '$.operation.kind') IS NOT 'authority')
THEN 1 ELSE 0 END;
--> statement-breakpoint
UPDATE run_meta SET schema_version = 2 WHERE singleton = 1;
--> statement-breakpoint
UPDATE run_format SET bundle_hash = 'b5b2b877ebe8b0e33765d2bb6d464e7d3ac0bcebc773807706e40ca5747f93b6' WHERE singleton = 1;
--> statement-breakpoint
DROP TABLE run_execution_down_guard;
--> statement-breakpoint
