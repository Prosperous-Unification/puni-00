-- Caller must validate the exact current bundle and physical schema before invocation.
-- Requires fail-fast execution of each complete statement in a caller transaction.
-- Whole-script Bun Database.run/exec can ignore intermediate errors and is unsupported.
CREATE TEMP TABLE run_runtime_down_guard (unused INTEGER NOT NULL CHECK(unused = 1));
--> statement-breakpoint
INSERT INTO run_runtime_down_guard(unused)
SELECT CASE WHEN
  (SELECT count(*) FROM run_meta) = 1 AND
  (SELECT count(*) FROM run_meta WHERE singleton = 1 AND schema_version = 2) = 1 AND
  (SELECT count(*) FROM run_format) = 1 AND
  (SELECT count(*) FROM run_format WHERE singleton = 1 AND scope_count = 0 AND intent_count = 0 AND acceptance_count = 0) = 1 AND
  NOT EXISTS(SELECT 1 FROM run_runtime_scope) AND
  NOT EXISTS(SELECT 1 FROM run_runtime_intent) AND
  NOT EXISTS(SELECT 1 FROM run_runtime_acceptance)
-- Proof: F33 made the used-runtime SQL guard always succeed; 'new down refuses pin' failed and exact restoration passed.
THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE run_runtime_acceptance;
--> statement-breakpoint
DROP TABLE run_runtime_intent;
--> statement-breakpoint
DROP TABLE run_runtime_scope;
--> statement-breakpoint
DROP TABLE run_format;
--> statement-breakpoint
UPDATE run_meta SET schema_version = 1 WHERE singleton = 1;
--> statement-breakpoint
DROP TABLE run_runtime_down_guard;
--> statement-breakpoint
