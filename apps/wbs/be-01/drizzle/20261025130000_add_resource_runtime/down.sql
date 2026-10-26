-- Refuse rollback once any authority or outbox has become an operational obligation.
-- Proof: allowing the nonempty CASE lost a binding-only ledger in the runtime rollback test (2026-10-25).
CREATE TABLE resource_runtime_rollback_guard (empty INTEGER CHECK(empty = 1));
--> statement-breakpoint
INSERT INTO resource_runtime_rollback_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM resource_authority) THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE resource_runtime_rollback_guard;
--> statement-breakpoint
DROP TABLE resource_cleanup_request;
--> statement-breakpoint
DROP TABLE resource_runtime_event;
--> statement-breakpoint
DROP TABLE resource_runtime_use;
--> statement-breakpoint
DROP TABLE resource_authority;
