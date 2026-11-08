-- A rollback must never discard reported responsibility or its audit evidence.
-- Proof: making the nonempty CASE succeed lost obligations in the destructive-rollback test (2026-10-25).
CREATE TABLE resource_use_rollback_guard (empty INTEGER CHECK(empty = 1));
--> statement-breakpoint
INSERT INTO resource_use_rollback_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM resource_use) THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE resource_use_rollback_guard;
--> statement-breakpoint
DROP TRIGGER resource_use_event_immutable_update;
--> statement-breakpoint
DROP TRIGGER resource_use_event_immutable_delete;
--> statement-breakpoint
DROP TABLE resource_use_event;
--> statement-breakpoint
DROP TABLE resource_use;
--> statement-breakpoint
