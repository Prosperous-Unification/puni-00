-- Proof: retained-count guard replaced with zero; down negative failed and
-- would discard authored facts (down-retained.txt), observed 2026-10-15.
CREATE TEMP TABLE step_parallel_rollback_guard (
  rows INTEGER NOT NULL,
  CONSTRAINT "step parallelism overrides exist: preserve and explicitly remove retained overrides before migrate-down-cli.ts --to=<baseline>; no automatic recovery tool is available in this foundation" CHECK (rows = 0)
);
--> statement-breakpoint
INSERT INTO step_parallel_rollback_guard SELECT count(*) FROM step_parallel;
--> statement-breakpoint
DROP TABLE step_parallel_rollback_guard;
--> statement-breakpoint
DROP TRIGGER step_parallel_owner_update;
--> statement-breakpoint
DROP TRIGGER step_parallel_owner_insert;
--> statement-breakpoint
DROP INDEX step_parallel_by_step;
--> statement-breakpoint
DROP TABLE step_parallel;
