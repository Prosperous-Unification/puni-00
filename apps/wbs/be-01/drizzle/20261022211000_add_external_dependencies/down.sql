-- Proof: replacing this required read with SELECT 1 changed `refuses rollback when the typed table is missing` from its missing-table reason to a missing-trigger reason (2026-10-22).
SELECT id FROM typed_dependency LIMIT 0;
--> statement-breakpoint
CREATE TEMP TABLE external_dependency_rollback_guard (allowed integer CONSTRAINT "external dependencies remain" CHECK (allowed = 1));
--> statement-breakpoint
-- Proof: forcing the guard to succeed lost the external row and ledger in `down refuses external rows and preserves local rows and their audit when empty` (2026-10-22).
INSERT INTO external_dependency_rollback_guard SELECT CASE WHEN EXISTS (SELECT 1 FROM external_dependency) THEN 0 ELSE 1 END;
--> statement-breakpoint
DROP TABLE external_dependency_rollback_guard;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_identity_insert`;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_endpoints_insert`;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_identity_update`;
--> statement-breakpoint
DROP TRIGGER `typed_dependency_cross_endpoints_update`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_identity_insert`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_endpoints_insert`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_identity_update`;
--> statement-breakpoint
DROP TRIGGER `external_dependency_cross_endpoints_update`;
--> statement-breakpoint
DROP TABLE `external_dependency`;
--> statement-breakpoint
DROP INDEX `step_id_project`;
--> statement-breakpoint
DROP INDEX `work_item_id_project`;
