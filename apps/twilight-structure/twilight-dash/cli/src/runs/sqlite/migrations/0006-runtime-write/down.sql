CREATE TEMP TABLE run6_down_guard (allowed INTEGER NOT NULL CHECK(allowed = 1));
--> statement-breakpoint
-- Proof: usage-sql-down-refusal broke “compiled format6 down independently refuses semantic use before destructive SQL”; exact source hash restored.
INSERT INTO run6_down_guard SELECT CASE WHEN (SELECT count(*) FROM run6_usage)=1 AND (SELECT count(*) FROM run6_usage WHERE singleton=1 AND used=0)=1 AND (SELECT count(*) FROM run_meta WHERE singleton=1 AND schema_version=6)=1 THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE run6_down_guard;
--> statement-breakpoint
DROP TABLE run6_write_receipt;
--> statement-breakpoint
DROP TABLE run6_write_obligation;
--> statement-breakpoint
DROP TABLE run6_write;
--> statement-breakpoint
DROP TABLE run6_write_format;
--> statement-breakpoint
DROP TABLE run6_recovery_active;
--> statement-breakpoint
DROP TABLE run6_recovery_barrier;
--> statement-breakpoint
DROP TABLE run6_recovery_closure;
--> statement-breakpoint
DROP TABLE run6_recovery_observation;
--> statement-breakpoint
DROP TABLE run6_recovery_fence;
--> statement-breakpoint
DROP TABLE run6_recovery_journal;
--> statement-breakpoint
DROP TABLE run6_runtime_acceptance;
--> statement-breakpoint
DROP TABLE run6_runtime_intent;
--> statement-breakpoint
DROP TABLE run6_runtime_scope;
--> statement-breakpoint
DROP TABLE run6_receipt;
--> statement-breakpoint
DROP TABLE run6_consumption;
--> statement-breakpoint
DROP TABLE run6_decision;
--> statement-breakpoint
DROP TABLE run6_outbox;
--> statement-breakpoint
DROP TABLE run6_completion;
--> statement-breakpoint
DROP TABLE run6_execution;
--> statement-breakpoint
DROP TABLE run6_reservation;
--> statement-breakpoint
DROP TABLE run6_attempt;
--> statement-breakpoint
DROP TABLE run6_record;
--> statement-breakpoint
DROP TABLE run6_recovery_format;
--> statement-breakpoint
DROP TABLE run6_runtime_format;
--> statement-breakpoint
DROP TABLE run6_usage;
--> statement-breakpoint

--> statement-breakpoint
UPDATE run_meta SET schema_version=5 WHERE singleton=1;
--> statement-breakpoint
UPDATE run_format SET bundle_hash='7ea6b478c036313e9890ea0db6ede03df784c9bbb1d1696de9c350436760ce8e' WHERE singleton=1;
--> statement-breakpoint
