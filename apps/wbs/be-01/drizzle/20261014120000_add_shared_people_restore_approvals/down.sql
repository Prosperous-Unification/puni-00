CREATE TEMP TABLE `shared_people_restore_down_check` (
  `empty` integer NOT NULL,
  CONSTRAINT "shared people restore evidence is recorded: rollback cannot discard approvals" CHECK (`empty` = 1)
);
--> statement-breakpoint
-- Proof: SELECT 1 instead of the counts failed both evidence/ledger rollback negatives (operation-only and approval).
INSERT INTO `shared_people_restore_down_check` (`empty`)
SELECT (SELECT COUNT(*) FROM `shared_people_restore_operation`) = 0 AND (SELECT COUNT(*) FROM `shared_people_restore_approval`) = 0;
--> statement-breakpoint
DROP TABLE `shared_people_restore_down_check`;
--> statement-breakpoint
DROP INDEX `shared_people_restore_approval_operation_organization`;
--> statement-breakpoint
DROP TABLE `shared_people_restore_approval`;
--> statement-breakpoint
DROP TABLE `shared_people_restore_operation`;
