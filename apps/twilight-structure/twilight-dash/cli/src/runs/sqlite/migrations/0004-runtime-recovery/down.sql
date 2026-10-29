-- Caller validates the complete installed format and history under BEGIN IMMEDIATE.
-- Execute complete breakpoint statements fail-fast and roll back at the first failure.
CREATE TEMP TABLE run_recovery_down_guard (allowed INTEGER NOT NULL CHECK(allowed = 1));
--> statement-breakpoint
INSERT INTO run_recovery_down_guard(allowed)
-- Proof: T3M4SQL allowing the guard unconditionally erased used recovery tables through real down-artifact execution; the test rolled back and restored temporary state; exact restoration passed.
SELECT CASE WHEN
  (SELECT count(*) FROM run_meta) = 1 AND
  (SELECT count(*) FROM run_meta WHERE singleton = 1 AND schema_version = 4) = 1 AND
  (SELECT count(*) FROM run_recovery_format) = 1 AND
  (SELECT count(*) FROM run_recovery_format WHERE singleton = 1 AND
    journal_count = 0 AND fence_count = 0 AND observation_count = 0 AND
    closure_count = 0 AND barrier_count = 0 AND active_count = 0) = 1 AND
  NOT EXISTS(SELECT 1 FROM run_recovery_journal) AND
  NOT EXISTS(SELECT 1 FROM run_recovery_fence) AND
  NOT EXISTS(SELECT 1 FROM run_recovery_observation) AND
  NOT EXISTS(SELECT 1 FROM run_recovery_closure) AND
  NOT EXISTS(SELECT 1 FROM run_recovery_barrier) AND
  NOT EXISTS(SELECT 1 FROM run_recovery_active) AND
  NOT EXISTS(SELECT 1 FROM run_attempt WHERE json_extract(record, '$.version') IS NOT 2)
THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE run_recovery_active;
--> statement-breakpoint
DROP TABLE run_recovery_barrier;
--> statement-breakpoint
DROP TABLE run_recovery_closure;
--> statement-breakpoint
DROP TABLE run_recovery_observation;
--> statement-breakpoint
DROP TABLE run_recovery_fence;
--> statement-breakpoint
DROP TABLE run_recovery_journal;
--> statement-breakpoint
DROP TABLE run_recovery_format;
--> statement-breakpoint
UPDATE run_meta SET schema_version = 3 WHERE singleton = 1;
--> statement-breakpoint
UPDATE run_format SET bundle_hash = 'd11130ee5ca84e51cb843daf8fbfc5695b704e3aecea1fb6d7c00234b2f43aed' WHERE singleton = 1;
--> statement-breakpoint
DROP TABLE run_recovery_down_guard;
--> statement-breakpoint
