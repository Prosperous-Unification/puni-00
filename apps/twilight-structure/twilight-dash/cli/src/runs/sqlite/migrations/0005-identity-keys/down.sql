CREATE TEMP TABLE run5_down_guard (allowed INTEGER NOT NULL CHECK(allowed = 1));
--> statement-breakpoint
-- Proof: Task3 037 replaced this guard with an unconditional success; direct SQL down removed tables for used, absent and invalid markers. Restored 042 refused all three before destructive statements.
INSERT INTO run5_down_guard SELECT CASE WHEN (SELECT count(*) FROM run5_usage)=1 AND (SELECT count(*) FROM run5_usage WHERE singleton=1 AND used=0)=1 AND (SELECT count(*) FROM run_meta WHERE singleton=1 AND schema_version=5)=1 THEN 1 ELSE 0 END;
--> statement-breakpoint
DROP TABLE run5_down_guard;
--> statement-breakpoint
DROP TABLE run5_recovery_active;
--> statement-breakpoint
DROP TABLE run5_recovery_barrier;
--> statement-breakpoint
DROP TABLE run5_recovery_closure;
--> statement-breakpoint
DROP TABLE run5_recovery_observation;
--> statement-breakpoint
DROP TABLE run5_recovery_fence;
--> statement-breakpoint
DROP TABLE run5_recovery_journal;
--> statement-breakpoint
DROP TABLE run5_runtime_acceptance;
--> statement-breakpoint
DROP TABLE run5_runtime_intent;
--> statement-breakpoint
DROP TABLE run5_runtime_scope;
--> statement-breakpoint
DROP TABLE run5_receipt;
--> statement-breakpoint
DROP TABLE run5_consumption;
--> statement-breakpoint
DROP TABLE run5_decision;
--> statement-breakpoint
DROP TABLE run5_outbox;
--> statement-breakpoint
DROP TABLE run5_completion;
--> statement-breakpoint
DROP TABLE run5_execution;
--> statement-breakpoint
DROP TABLE run5_reservation;
--> statement-breakpoint
DROP TABLE run5_attempt;
--> statement-breakpoint
DROP TABLE run5_record;
--> statement-breakpoint
DROP TABLE run5_recovery_format;
--> statement-breakpoint
DROP TABLE run5_runtime_format;
--> statement-breakpoint
DROP TABLE run5_usage;
--> statement-breakpoint
UPDATE run_meta SET schema_version=4 WHERE singleton=1;
--> statement-breakpoint
UPDATE run_format SET bundle_hash='7513eae970beb3028572e9720a8c6db1ed7d36d16f2d2def59c3d5f839a8a058' WHERE singleton=1;
--> statement-breakpoint
